"""Results card, checked against the results filing itself.

The lite model only copies figures as printed (with the row they sit in and the unit header). Code:
  1. verifies every quote is in the PDF text (OCR-tolerant only for O/0 and l/1, applied to both sides),
  2. checks each figure appears inside its quote, converts units (lakh / million / crore / billion) to crore,
  3. derives EBITDA = PBT + finance costs + depreciation - other income (filings don't print EBITDA),
  4. cross-checks Revenue, EBITDA, PBT, PAT against screener's table: match / mismatch / fallback.
"""
import io
import re

import requests
from pypdf import PdfReader

from . import gemini
from .config import UA
from .verify import norm

SYSTEM = ("You copy figures from an Indian company's quarterly financial results statement. Copy numbers exactly as "
          "printed, including commas and decimals. Never compute, round or convert. Output JSON only.")

PROMPT = """Statement pages (between <<< >>>):
<<<
{text}
>>>

Use the {variant} statement (if both standalone and consolidated appear), the column for the QUARTER ended {qend}
(the current quarter, not the previous quarter, not the half year, not the year-ago quarter).
Return JSON {{
 "unit_quote": "exact text of the units note, e.g. '(Rs. in crore)' or '₹ in lakhs' or 'Rs. million'",
 "fields": {{
   "revenue":        {{"value": "as printed", "quote": "exact row text"}},   // Revenue from operations; banks: Interest earned
   "other_income":   {{"value": ..., "quote": ...}},
   "finance_costs":  {{"value": ..., "quote": ...}},                         // banks: null
   "depreciation":   {{"value": ..., "quote": ...}},
   "pbt":            {{"value": ..., "quote": ...}},                         // Profit before tax (after exceptional items)
   "pat":            {{"value": ..., "quote": ...}},                         // Profit for the period (total)
   "pat_owners":     {{"value": ..., "quote": ...}}                          // attributable to owners, or null
 }}
}}
Use null for any field not printed. Each quote must be copied character-for-character from the pages."""

_UNITS = [(r"lakh|lac", 0.01), (r"million|mn\b", 0.1), (r"billion|bn\b", 100.0), (r"crore|cr\b", 1.0)]
_MON = {"Mar": "March 31", "Jun": "June 30", "Sep": "September 30", "Dec": "December 31"}


def _ocr(s):
    """Normalise for quote checks: typography/whitespace/hyphens, plus the two OCR digit confusions (O->0, l->1)."""
    return re.sub(r"[\s-]+", "", norm(s)).replace("o", "0").replace("l", "1")


def quote_ok(quote, text):
    return bool(quote) and len(quote.strip()) >= 6 and _ocr(quote) in _ocr(text)


def _num_variants(raw):
    """A printed figure can use ',' or (in OCR'd PDFs) '.' as a thousands separator; brackets mean negative."""
    s = str(raw).strip().replace("O", "0").replace("o", "0").replace("l", "1")
    neg = s.startswith("(") or s.startswith("-")
    s = re.sub(r"[^\d.,]", "", s)
    if not s:
        return []
    out = {s.replace(",", "")}
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", s):            # 31.658 -> 31658
        out.add(s.replace(".", ""))
    if re.fullmatch(r"[\d,]*\d,\d{1,2}", s):              # 582,22 -> 582.22 (decimal comma in OCR text)
        out.add(s[: s.rfind(",")].replace(",", "") + "." + s[s.rfind(",") + 1:])
    vals = []
    for v in out:
        try:
            vals.append(-float(v) if neg else float(v))
        except ValueError:
            pass
    return vals


def _in_quote(raw, quote):
    digits = re.sub(r"\D", "", str(raw).replace("O", "0").replace("o", "0").replace("l", "1"))
    return bool(digits) and digits in re.sub(r"\D", "", _ocr(quote))


def first_column(quote):
    """Indian results tables print the current quarter first: the first figure with 3+ digits in a verified row
    (row numbers like '12' and labels like '(a)' are skipped). Code, not the model, decides the column."""
    for tok in re.findall(r"\(?\d[\d,.]*\)?", quote or ""):
        if len(re.sub(r"\D", "", tok)) >= 3:
            return tok
    return None


def _on_page(raw, text):
    tok = _ocr(str(raw))
    return len(re.sub(r"\D", "", tok)) >= 2 and tok in _ocr(text)


def pages_for(url, variant):
    r = requests.get(url, headers={"User-Agent": UA, "Referer": "https://www.bseindia.com/"}, timeout=60)
    if r.status_code != 200 or r.content[:4] != b"%PDF":
        return None, "PDF not downloadable"
    try:
        pg = [(p.extract_text() or "") for p in PdfReader(io.BytesIO(r.content)).pages[:40]]
    except Exception:  # noqa: BLE001
        return None, "PDF unreadable"
    if sum(len(t.strip()) for t in pg) < 500:
        return None, "scanned PDF without a text layer"
    kw = re.compile(r"revenue|income|profit|expense|depreciation|finance cost|interest|tax", re.I)

    def score(t):
        s = len(kw.findall(t)) + len(re.findall(r"\d[\d,.]{3,}", t)) / 10
        if variant.lower() in t.lower():
            s *= 1.5
        if re.search(r"cash flow|assets and liabilities|segment", t, re.I):
            s *= 0.4
        return s
    best = sorted(range(len(pg)), key=lambda i: -score(pg[i]))[:2]
    return [(i + 1, pg[i]) for i in sorted(best)], None


def check(url, variant, quarter_label, card, cache_key):
    """Return a filing_check dict for a results card."""
    pages, why = pages_for(url, variant)
    if not pages:
        return {"status": "fallback", "reason": why}
    text = "\n\n".join(f"[page {n}]\n{t}" for n, t in pages)[:16000]
    m, y = quarter_label.split()
    try:
        raw = gemini.ask_json(SYSTEM, PROMPT.format(text=text, variant=variant, qend=f"{_MON[m]}, {y}"),
                              models=gemini.CHEAP, key=cache_key)
    except gemini.BudgetExceeded as e:
        return {"status": "fallback", "reason": f"not checked ({e})"}
    except gemini.QuotaExceeded:
        return {"status": "fallback", "reason": "not checked against the filing: the AI step is paused (quota)"}
    except Exception as e:  # noqa: BLE001
        return {"status": "fallback", "reason": f"extraction failed ({str(e)[:60]})"}
    full = "\n".join(t for _, t in pages)
    uq = (raw or {}).get("unit_quote") or ""
    mult = next((k for rx, k in _UNITS if re.search(rx, uq, re.I)), None) if quote_ok(uq, full) else None
    if mult is None:
        return {"status": "fallback", "reason": "the filing's text couldn't be read reliably (units not found)"}
    F, got = (raw or {}).get("fields") or {}, {}
    for k, v in F.items():
        if not isinstance(v, dict) or v.get("value") in (None, "", "null") or not quote_ok(v.get("quote"), full):
            continue
        q = v["quote"].strip()
        if _in_quote(v["value"], q):
            how = "same row"
        elif _on_page(v["value"], full):
            how = "label and figure on the same page"   # PDFs that extract column by column
        else:
            continue
        cands = _num_variants(v["value"])
        fc = first_column(q) if how == "same row" else None
        if fc:
            cands += _num_variants(fc)
        got[k] = {"cands": [x * mult for x in cands], "quote": q, "printed": str(v["value"]), "how": how}

    L = card.get("lines") or {}
    scr = {k: (L.get(k) or {}).get("value") for k in ("revenue", "ebitda", "pbt", "pat")}

    def close(a, b, tol):
        return a is not None and b is not None and abs(a - b) <= max(tol * abs(b), 1.0)

    def best(cands, target):
        return min(cands, key=lambda c: abs(c - target)) if cands and target is not None else (cands[0] if cands else None)

    lines = {}
    for k in ("revenue", "pbt"):
        if k in got:
            v = best(got[k]["cands"], scr[k])
            lines[k] = {"filing": round(v, 1), "screener": scr[k], "match": close(v, scr[k], 0.01), "quote": got[k]["quote"]}
    pat_c = (got.get("pat", {}).get("cands") or []) + (got.get("pat_owners", {}).get("cands") or [])
    if pat_c:
        v = best(pat_c, scr["pat"])
        q = got["pat"]["quote"] if "pat" in got and v in got["pat"]["cands"] else got.get("pat_owners", got.get("pat", {})).get("quote")
        lines["pat"] = {"filing": round(v, 1), "screener": scr["pat"], "match": close(v, scr["pat"], 0.01), "quote": q}
    if scr["ebitda"] is not None and all(k in got for k in ("pbt", "depreciation", "other_income")):
        pbt = best(got["pbt"]["cands"], scr["pbt"])
        fin = best(got["finance_costs"]["cands"], 0) if "finance_costs" in got else 0.0
        dep = best(got["depreciation"]["cands"], 0)
        oi = best(got["other_income"]["cands"], 0)
        e = pbt + fin + dep - oi
        lines["ebitda"] = {"filing": round(e, 1), "screener": scr["ebitda"], "match": close(e, scr["ebitda"], 0.02),
                           "quote": "PBT + finance costs + depreciation - other income, each verified in the filing"}
    core = [lines[k] for k in ("revenue", "pbt", "pat") if k in lines]
    if len(core) < 2:
        return {"status": "fallback", "reason": f"only {len(core)} of revenue, PBT and PAT could be read from the filing",
                "lines": lines, "pages": [n for n, _ in pages]}
    if any(x["screener"] and abs(x["filing"] - x["screener"]) > 0.25 * abs(x["screener"]) for x in core):
        # a real restatement this large is implausible: the filing's text (OCR) or column was misread
        return {"status": "fallback", "reason": "the filing's text couldn't be read reliably (scanned/OCR)", "pages": [n for n, _ in pages]}
    status = "matched" if all(x["match"] for x in core) else "mismatch"
    if "ebitda" in lines:
        lines["ebitda"]["derived"] = True  # informational: definitions of operating profit differ between sources
    return {"status": status, "lines": lines, "unit": uq.strip(), "pages": [n for n, _ in pages], "checked": len(core)}
