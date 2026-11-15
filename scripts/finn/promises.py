"""Promise tracker: what management guided vs what the tables show.

Gemini (STRONG model) only finds guidance and copies the exact quote. Code then:
  1. checks the quote exists in the transcript,
  2. checks every target number appears inside the quote,
  3. maps the metric + period onto screener columns and computes the actual,
  4. decides Beat / Met / Missed / In progress, and counts credibility.
"""
import collections
import re

from . import gemini
from .screener import period_key
from .verify import numbers_in, quote_in_text

SYSTEM = ("You extract management guidance from an Indian listed company's earnings-call transcript. "
          "You only copy text verbatim. Never use outside knowledge about the company. Output JSON only.")

PROMPT = """Earnings-call transcript ({quarter} call) between <<< >>>:
<<<
{text}
>>>

Find every explicit forward-looking target that MANAGEMENT (not analysts) states for a headline number:
revenue growth, revenue amount, EBITDA margin, EBIT margin, PAT margin, EBITDA growth, PAT growth.
Skip vague statements with no number. Include capex / order book / segment / USD targets too, but mark them metric "other".

Return JSON {{"guidance": [{{
  "metric": "revenue_growth_yoy" | "revenue" | "ebitda_margin" | "ebit_margin" | "pat_margin" | "ebitda_growth_yoy" | "pat_growth_yoy" | "other",
  "scope": "company" | "segment",
  "period": "fiscal period the target is for, normalised: Q1FY27 / H2FY27 / FY27 / FY26-FY30 (multi-year) / unspecified",
  "kind": "range" | "at_least" | "at_most" | "about" | "change",
  "low": number or null,
  "high": number or null,
  "unit": "%" | "bps" | "crore" | "inr_bn" | "inr_mn" | "usd_mn" | "usd_bn" | "other",
  "qualifier": "exact qualifying words that narrow the target, e.g. 'excluding Vivo', 'organic', 'constant currency', 'ex-acquisition'; null if none",
  "summary": "<= 12 words, plain English",
  "speaker": "name as in transcript, or null",
  "quote": "exact sentence(s) from the transcript containing the target, copied character-for-character"
}}]}}
low/high must be the numbers exactly as written in the quote (do not convert units; say "INR 60 billion" -> low 60, unit inr_bn).
A margin improvement ("100 bps EBIT margin expansion in FY26") is kind "change", unit "bps".
Use period "unspecified" for ongoing / medium-term / long-term targets that name no fiscal year.
Indian fiscal year FY27 = April 2026 to March 2027. "This year" in a {quarter} call means {fy}."""

MON = {"Mar": 3, "Jun": 6, "Sep": 9, "Dec": 12}
TOL = {"%margin": 0.2, "%growth": 1.0, "abs": 0.02}  # margins are reported to 0.1pp; growth to ~1pp
CHECKABLE = {"revenue_growth_yoy", "revenue", "ebitda_margin", "ebit_margin", "pat_margin",
             "ebitda_growth_yoy", "pat_growth_yoy"}


# ------------------------------------------------------------ fiscal-period helpers
def fy_of(label):
    """'Sep 2026' -> fiscal year 27 (FY27 = Apr 2026..Mar 2027)."""
    m, y = label.split()
    return (int(y) + (0 if MON[m] == 3 else 1)) % 100


def quarter_cols(period):
    """'Q2FY27' -> ['Sep 2026'];  'H1FY27' -> ['Jun 2026','Sep 2026'];  'FY27' -> 4 quarter labels."""
    m = re.fullmatch(r"(Q[1-4]|H[12])?FY(\d{2})", period or "")
    if not m:
        return None
    fy = 2000 + int(m.group(2))
    qmap = {"Q1": [f"Jun {fy - 1}"], "Q2": [f"Sep {fy - 1}"], "Q3": [f"Dec {fy - 1}"], "Q4": [f"Mar {fy}"]}
    if m.group(1) is None:
        return qmap["Q1"] + qmap["Q2"] + qmap["Q3"] + qmap["Q4"]
    if m.group(1) == "H1":
        return qmap["Q1"] + qmap["Q2"]
    if m.group(1) == "H2":
        return qmap["Q3"] + qmap["Q4"]
    return qmap[m.group(1)]


def prior_year(cols):
    return [f"{c.split()[0]} {int(c.split()[1]) - 1}" for c in cols]


def detect_quarter(text, call_label=None):
    """Code decides which quarter a transcript is about, from its own text (screener labels can be wrong)."""
    head = text[:8000]
    c = collections.Counter()
    for q, y in re.findall(r"\bQ\s*([1-4])\s*(?:FY|F\.Y\.|FY\s*')\s*'?(\d{2,4})", head, re.I):
        c[f"Q{q}FY{int(y) % 100:02d}"] += 1
    for mon, yr in re.findall(r"quarter (?:and [\w\s-]+ )?ended,? (June|September|December|March) 3[01],? (20\d\d)", head, re.I):
        lab = {"June": "Jun", "September": "Sep", "December": "Dec", "March": "Mar"}[mon.title()] + f" {yr}"
        q = {"Jun": 1, "Sep": 2, "Dec": 3, "Mar": 4}[lab[:3]]
        c[f"Q{q}FY{fy_of(lab):02d}"] += 1
    if c:
        return c.most_common(1)[0][0], "text"
    if call_label:  # last resort: the call month (results calls happen the month after quarter end, or two)
        mon, yr = call_label.split()
        mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].index(mon) + 1
        yr = int(yr)
        q_end = {1: 12, 2: 12, 3: 12, 4: 3, 5: 3, 6: 3, 7: 6, 8: 6, 9: 6, 10: 9, 11: 9, 12: 9}[mo]
        y_end = yr - 1 if mo <= 3 and q_end == 12 else yr
        lab = f"{['Mar', 'Jun', 'Sep', 'Dec'][[3, 6, 9, 12].index(q_end)]} {y_end}"
        q = {"Jun": 1, "Sep": 2, "Dec": 3, "Mar": 4}[lab[:3]]
        return f"Q{q}FY{fy_of(lab):02d}", "call_date"
    return None, "unknown"


# ------------------------------------------------------------ actuals from tables
def _sum(rows, name, headers, cols):
    vals = rows.get(name)
    if vals is None:
        return None
    out = 0.0
    for c in cols:
        if c not in headers:
            return None
        v = vals[headers.index(c)]
        if v is None:
            return None
        out += v
    return out


def _flows(q, cols):
    h, r = q["headers"], q["rows"]
    sales = _sum(r, "Sales", h, cols) if "Sales" in r else _sum(r, "Revenue", h, cols)
    op = _sum(r, "Operating Profit", h, cols)
    dep = _sum(r, "Depreciation", h, cols)
    pat = _sum(r, "Net Profit", h, cols)
    return {"revenue": sales, "ebitda": op, "ebit": (op - dep) if op is not None and dep is not None else None,
            "pat": pat}


def actual(metric, period, quarters, annual):
    """Return (value, status, basis). status: final | partial | unavailable."""
    cols = quarter_cols(period)
    if not cols:
        return None, "unavailable", "period not mappable"
    have = [c for c in cols if c in quarters["headers"]]
    is_fy = period.startswith("FY")
    if is_fy and annual and f"Mar 20{period[2:]}" in annual["headers"]:
        # full year: use the annual P&L column (audited), and the year before for growth
        yc = f"Mar 20{period[2:]}"
        cur, prev = _flows(annual, [yc]), _flows(annual, [f"Mar {int(yc[4:]) - 1}"])
        status, basis = "final", f"annual {yc}"
    elif len(have) == len(cols):
        cur, prev = _flows(quarters, cols), _flows(quarters, prior_year(cols))
        status, basis = "final", " + ".join(cols)
    elif have:
        cur, prev = _flows(quarters, have), _flows(quarters, prior_year(have))
        status, basis = "partial", "YTD " + " + ".join(have)
    else:
        return None, "unavailable", f"no reported quarters yet for {period}"

    def margin(k):
        return round(cur[k] / cur["revenue"] * 100, 1) if cur[k] is not None and cur["revenue"] else None

    def growth(k):
        return round((cur[k] / prev[k] - 1) * 100, 1) if cur[k] is not None and prev[k] else None

    val = {"revenue": cur["revenue"], "ebitda_margin": margin("ebitda"), "ebit_margin": margin("ebit"),
           "pat_margin": margin("pat"), "revenue_growth_yoy": growth("revenue"),
           "ebitda_growth_yoy": growth("ebitda"), "pat_growth_yoy": growth("pat")}[metric]
    if metric == "revenue" and status == "partial":
        return val, "partial", basis  # an annual absolute target can't be judged on a part-year
    return val, status, basis


def verdict(g, val):
    lo, hi, kind = g.get("low"), g.get("high"), g.get("kind")
    if g["metric"] == "revenue":
        tol = TOL["abs"] * (lo or hi or 0)
    elif g["metric"].endswith("margin"):
        tol = TOL["%margin"]
    else:
        tol = TOL["%growth"]
    if kind == "about":
        lo = hi = lo if lo is not None else hi
    if kind == "at_least" or (kind == "range" and hi is None):
        hi = None
    if kind == "at_most":
        return "Met" if val <= hi + tol else "Missed"
    if lo is not None and val < lo - tol:
        return "Missed"
    if hi is not None and val > hi + tol:
        return "Beat"
    if hi is None and lo is not None and val > lo + 3 * tol:
        return "Beat"
    return "Met"


# ------------------------------------------------------------ pipeline
_GUIDE = re.compile(r"guid|expect|target|aspir|\baim|outlook|going forward|next year|this year|\bfy ?'?\d{2}|medium|"
                    r"long[- ]term|confident|range|bps|basis points|we will|should be|would be|trajectory|by 20\d\d", re.I)


def guidance_chunks(text, window=2):
    """Chunking for cost: keep only sentences that contain a number AND a guidance word, plus `window` sentences of
    context each side. Quotes are still verified against the FULL transcript, so nothing is lost for checking."""
    sents = re.split(r"(?<=[.?!])\s+", re.sub(r"\s+", " ", text))
    keep = set()
    for i, s_ in enumerate(sents):
        if _GUIDE.search(s_) and re.search(r"\d", s_):
            keep.update(range(i - window, i + window + 1))
    out, last = [], -2
    for i in sorted(k for k in keep if 0 <= k < len(sents)):
        out.append(("\n...\n" if i != last + 1 and out else "") + sents[i])
        last = i
    return " ".join(out)


def extract(text, quarter, url=None):
    fy = "FY" + quarter[-2:] if quarter else "the current fiscal year"
    raw = gemini.ask_json(SYSTEM, PROMPT.format(text=guidance_chunks(text)[:90000], quarter=quarter or "recent", fy=fy),
                          models=gemini.STRONG, key=f"promises:v1:{url}" if url else None)
    if isinstance(raw, list):
        raw = {"guidance": raw}
    return raw.get("guidance", [])


def check(g, text, call_quarter, quarters, annual):
    """Apply every code check to one model-extracted guidance item."""
    out = {k: g.get(k) for k in ("metric", "scope", "period", "kind", "low", "high", "unit", "summary",
                                 "speaker", "quote", "qualifier")}
    out["call"] = call_quarter
    if not quote_in_text(g.get("quote"), text):
        return {**out, "status": "rejected", "reason": "quote not found in transcript"}
    # Guidance must be management speaking, not an analyst asking about it.
    if "?" in g.get("quote", "") or re.search(r"\b(wanted to ask|my (first |next )?question|question is|could you)\b", g.get("quote", ""), re.I):
        return {**out, "status": "rejected", "reason": "analyst question, not a management statement"}
    nums = numbers_in(g.get("quote"))
    for t in (g.get("low"), g.get("high")):
        if t is not None and not any(abs(n - float(t)) < 1e-6 for n in nums):
            return {**out, "status": "rejected", "reason": f"target {t} not stated in the quote"}
    if g.get("low") is None and g.get("high") is None:
        return {**out, "status": "not_checkable", "reason": "no number stated"}
    period = (g.get("period") or "").upper().replace(" ", "").replace("'", "")
    out["period"] = period
    conv = {"inr_bn": 100.0, "inr_mn": 0.1}.get(g.get("unit"))
    if conv:  # code converts to crore AFTER checking the number as written
        for k in ("low", "high"):
            if out.get(k) is not None:
                out[k] = round(float(out[k]) * conv, 2)
        out["unit"] = g["unit"] = "crore"
        g = {**g, "low": out["low"], "high": out["high"]}
    q = (g.get("qualifier") or "").strip()
    horizon = re.fullmatch(r"[\w\s,()-]*(term|aspir|ambition|run[- ]rate|guidance|target|trajectory|steady state|scale)[\w\s,()-]*", q, re.I)
    narrows = re.search(r"exclud|\bex[- ]|excl\.|organic|constant currency|\bcc\b|like[- ]for[- ]like|segment|business|division|"
                        r"\bjv\b|capex|export|domestic", q, re.I)
    if q and q.lower() not in ("null", "none") and (narrows or not horizon):
        # a target that excludes something can't be checked against reported totals
        return {**out, "status": "not_checkable", "reason": f"qualified target ({q}); tables show reported totals"}
    if g.get("unit") == "bps" and g.get("metric", "").endswith("margin") and g.get("scope") == "company":
        return bps_change(out, g, period, call_quarter, quarters, annual)
    if g.get("metric") not in CHECKABLE or g.get("scope") != "company" or g.get("unit") not in ("%", "crore"):
        return {**out, "status": "not_checkable", "reason": "segment / non-INR / non-table metric"}
    if (g["metric"] == "revenue") != (g.get("unit") == "crore"):
        return {**out, "status": "not_checkable", "reason": "unit does not match metric"}
    if not quarter_cols(period):
        if g["metric"].endswith("margin") and g.get("kind") in ("range", "at_least", "about"):
            return standing(out, g, call_quarter, quarters)
        return {**out, "status": "not_checkable",
                "reason": "multi-year target" if "-" in period else "period not stated"}
    # Guidance must be about the future: the period has to end after the quarter the call discussed.
    if call_quarter and quarter_cols(call_quarter):
        if period_key(quarter_cols(period)[-1]) <= period_key(quarter_cols(call_quarter)[-1]):
            return {**out, "status": "rejected", "reason": "period already reported at the time of the call"}
    val, st, basis = actual(g["metric"], period, quarters, annual)
    out.update({"actual": val, "basis": basis})
    if val is None:
        return {**out, "status": "in_progress", "reason": basis}
    if st == "partial":
        return {**out, "status": "in_progress", "tracking": val}
    return {**out, "status": "resolved", "verdict": verdict(g, val)}


def bps_change(out, g, period, call_quarter, quarters, annual):
    """'X bps margin improvement in/by FY26': margin(period) - margin(last full FY reported before the call)."""
    if not re.fullmatch(r"FY\d{2}", period) or not call_quarter:
        return {**out, "status": "not_checkable", "reason": "bps target without a single fiscal year"}
    # "X bps improvement in FY27" is measured against the year before the target year.
    base_fy = int(period[2:]) - 1
    base, _, _ = actual(g["metric"], f"FY{base_fy:02d}", quarters, annual)
    cur, st, basis = actual(g["metric"], period, quarters, annual)
    if base is None:
        return {**out, "status": "not_checkable", "reason": f"no FY{base_fy:02d} base in tables"}
    out["base"] = f"FY{base_fy:02d} {base}%"
    if cur is None:
        return {**out, "status": "in_progress", "reason": basis}
    delta = round((cur - base) * 100)
    out.update({"actual": delta, "basis": f"{basis}: {cur}% vs FY{base_fy:02d} {base}%"})
    if st == "partial":
        return {**out, "status": "in_progress", "tracking": delta}
    tol_g = {**g, "metric": "bps"}
    lo, hi = g.get("low"), g.get("high")
    if g.get("kind") == "change" and hi is None:
        hi = lo
    tol = 25  # bps
    v = "Missed" if delta < (lo or 0) - tol else "Beat" if hi is not None and delta > hi + tol else "Met"
    del tol_g
    return {**out, "status": "resolved", "verdict": v}


def standing(out, g, call_quarter, quarters):
    """An ongoing margin range ('sustain 11-13%'): test every quarter reported after the call."""
    after = [c for c in quarters["headers"]
             if call_quarter and quarter_cols(call_quarter) and period_key(c) > period_key(quarter_cols(call_quarter)[-1])]
    checks = []
    for c in after:
        v, _, _ = actual(g["metric"], f"Q{ {6: 1, 9: 2, 12: 3, 3: 4}[MON[c[:3]]] }FY{fy_of(c):02d}", quarters, None)
        if v is not None:
            checks.append({"quarter": c, "value": v, "verdict": verdict(g, v)})
    held = sum(1 for x in checks if x["verdict"] in ("Met", "Beat"))
    return {**out, "status": "standing", "checks": checks, "held": held, "tested": len(checks),
            "period": "ongoing"}


def run(symbol, scr, max_transcripts=5):
    from . import pdf
    quarters, annual = scr["quarters"], scr["annual"]
    transcripts, items, seen = [], [], set()
    for c in scr.get("concalls", []):
        u = c.get("transcript_url")
        if not u or u in seen:
            continue
        seen.add(u)
        text = pdf.text(u, max_pages=80)
        if len(text) < 5000:
            transcripts.append({"label": c["period"], "url": u, "status": "unreadable_or_blocked"})
            continue
        q, how = detect_quarter(text, c["period"])
        if any(t.get("quarter") == q for t in transcripts):
            continue  # same call listed twice
        transcripts.append({"label": c["period"], "quarter": q, "quarter_basis": how, "url": u, "chars": len(text),
                            "status": "ok"})
        try:
            found = extract(text, q, url=u)
        except (gemini.QuotaExceeded, gemini.BudgetExceeded) as e:
            transcripts[-1]["status"] = f"skipped: {e}"
            break
        for g in found:
            item = check(g, text, q, quarters, annual)
            item["source_url"] = u
            items.append(item)
        if sum(1 for t in transcripts if t["status"] == "ok") >= max_transcripts:
            break

    # Credibility: each (metric, period) target is judged once, on its EARLIEST statement; later calls that
    # repeat or revise it are attached as follow-ups so the user sees whether the goalposts moved.
    order = {t["quarter"]: i for i, t in enumerate(reversed([t for t in transcripts if t.get("quarter")]))}
    tracked = [i for i in items if i["status"] in ("resolved", "in_progress", "standing")]
    tracked.sort(key=lambda i: order.get(i["call"], 99))
    groups = {}
    for i in tracked:
        key = (i["metric"], i["period"]) if i["status"] != "standing" else (i["metric"], "ongoing", i["low"], i["high"])
        groups.setdefault(key, []).append(i)
    promises = []
    for _key, gs in groups.items():
        first = dict(gs[0])
        fu, seen_calls = [], {first["call"]}
        for x in gs[1:]:  # one follow-up per later call
            if x["call"] in seen_calls:
                continue
            seen_calls.add(x["call"])
            fu.append({"call": x["call"], "quote": x["quote"], "low": x["low"], "high": x["high"],
                       "kind": x["kind"], "source_url": x["source_url"]})
        first["followups"] = fu
        promises.append(first)
    kept = sum(1 for p in promises if p.get("verdict") in ("Met", "Beat"))
    resolved = sum(1 for p in promises if p["status"] == "resolved")
    return {
        "symbol": symbol,
        "transcripts": transcripts,
        "promises": sorted(promises, key=lambda p: (p["status"] != "resolved", p["period"])),
        "not_checkable": [i for i in items if i["status"] == "not_checkable"],
        "rejected": [i for i in items if i["status"] == "rejected"],
        "credibility": {"kept": kept, "resolved": resolved,
                        "in_progress": sum(1 for p in promises if p["status"] == "in_progress"),
                        "standing": sum(1 for p in promises if p["status"] == "standing")},
    }
