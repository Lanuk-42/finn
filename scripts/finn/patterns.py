"""Pattern flags from filing history (code only, no LLM):
  1. credit rating vs the previous rating (from the rating letters' text),
  2. two or more senior exits within 90 days (from verified management cards),
  3. promoter pledge trend (creation vs release disclosures, last 90 days vs the 90 before).
Each pattern carries a plain-English lead and severity: "flag" (worth your attention) or "info".
"""
import re
from datetime import datetime, timedelta

from . import pdf

SCALE = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-", "C", "D"]
AGENCY = r"(ICRA|CRISIL|Crisil|CARE|Care|IND|India Ratings|Acuite|ACUITE|Brickwork|BWR)"
RATING_RX = re.compile(AGENCY + r"\]?\s*\]?\s*(AAA|AA\+|AA-|AA|A\+|A-|BBB\+|BBB-|BBB|BB\+|BB-|BB|A)(?![\w+-])(.{0,90})", re.S)
OUTLOOK_RX = re.compile(r"watch with (negative|developing|positive) implications|\b(stable|positive|negative)\b", re.I)

AG_NORM = {"crisil": "CRISIL", "icra": "ICRA", "care": "CARE", "ind": "India Ratings", "india ratings": "India Ratings",
           "acuite": "Acuite", "brickwork": "Brickwork", "bwr": "Brickwork"}


def _short(ts):
    return datetime.fromisoformat(ts).strftime("%-d %b")


def _rating_of(text):
    """Best long-term rating mentioned: (agency, rating, outlook). Takes the most frequent agency+rating pair."""
    found = {}
    for ag, r, tail in RATING_RX.findall(re.sub(r"\s+", " ", text)):
        o = OUTLOOK_RX.search(tail)
        outlook = None
        if o:
            outlook = f"watch {o.group(1).lower()}" if o.group(1) else o.group(2).lower()
        key = (AG_NORM.get(ag.lower(), ag), r)
        c, prev_o = found.get(key, (0, None))
        found[key] = (c + 1, prev_o or outlook)
    if not found:
        return None
    (ag, r), (_, outlook) = max(found.items(), key=lambda kv: (kv[1][0], -SCALE.index(kv[0][1])))
    return {"agency": ag, "rating": r, "outlook": outlook}


def credit(sym, name, filings):
    fs = sorted([f for f in filings if f["category"] == "credit_rating" and f.get("url")], key=lambda f: f["ts"])
    seen = []
    for f in fs:
        r = _rating_of(pdf.text(f["url"], max_pages=4))
        head = (f.get("headline") or "").lower()
        if r:
            seen.append({**r, "ts": f["ts"], "id": f["id"]})
        elif "upgrad" in head or "downgrad" in head:
            seen.append({"agency": "international", "rating": None, "outlook": None, "ts": f["ts"], "id": f["id"],
                         "direction": "upgrade" if "upgrad" in head else "downgrade"})
    if not seen:
        return None
    last = seen[-1]
    prev = next((x for x in reversed(seen[:-1]) if x["agency"] == last["agency"] and x["rating"]), None)
    neg = last.get("outlook") in ("negative", "watch negative") or last.get("direction") == "downgrade"
    if last.get("direction"):
        lead = f"{name}: an international rating was {'upgraded' if last['direction'] == 'upgrade' else 'downgraded'} ({_short(last['ts'])})."
        return {"kind": "credit", "severity": "flag" if neg else "info", "lead": lead, "filings": [last["id"]]}
    now = f"{last['agency']} {last['rating']}" + (f" ({last['outlook']})" if last.get("outlook") else "")
    if prev:
        a, b = SCALE.index(prev["rating"]), SCALE.index(last["rating"])
        if b < a:
            lead, sev = f"{name} was upgraded by {last['agency']}: {prev['rating']} → {last['rating']} ({_short(last['ts'])}).", "info"
        elif b > a:
            lead, sev = f"{name} was downgraded by {last['agency']}: {prev['rating']} → {last['rating']} ({_short(last['ts'])}).", "flag"
        elif prev.get("outlook") != last.get("outlook") and last.get("outlook"):
            lead, sev = f"{name}’s {last['agency']} outlook moved from {prev.get('outlook') or 'unstated'} to {last['outlook']} at {last['rating']} ({_short(last['ts'])}).", "flag" if neg else "info"
        elif last.get("outlook") == "watch negative":
            lead, sev = f"{name} remains on {last['agency']} rating watch with negative implications at {last['rating']} ({_short(last['ts'])}), as on {_short(prev['ts'])}.", "flag"
        else:
            lead, sev = f"{name}’s rating is unchanged: {now}, same as {_short(prev['ts'])}.", "flag" if neg else "info"
    else:
        lead, sev = f"{name} is rated {now} ({_short(last['ts'])}); no earlier {last['agency']} rating in the last 180 days to compare.", "flag" if neg else "info"
    if neg and "watch" in (last.get("outlook") or "") and "watch" not in lead:
        lead = lead.rstrip(".") + "; on rating watch."
    return {"kind": "credit", "severity": sev, "lead": lead, "filings": [x["id"] for x in seen[-2:]]}


SENIOR = re.compile(r"chief|\bceo\b|\bcfo\b|\bcoo\b|\bcto\b|managing director|whole[- ]time|executive director|president|head|"
                    r"senior management|key managerial|\bkmp\b|\bsmp\b|company secretary|general counsel|chairman", re.I)
NOT_SENIOR = re.compile(r"independent|non[- ]?executive|nominee", re.I)


def exits(sym, name, filings, now, days=90):
    out, seen = [], set()
    for f in sorted(filings, key=lambda f: f["ts"]):
        c = f.get("card")
        if not c or c.get("type") != "management" or (now - datetime.fromisoformat(f["ts"])).days > days:
            continue
        for p in c.get("people", []):
            key = re.sub(r"^(mr|ms|mrs|dr|shri|smt)\.?\s*", "", p["name"].lower()).strip()
            if p["change"] == "left" and SENIOR.search(p["role"]) and not NOT_SENIOR.search(p["role"]) and key not in seen:
                seen.add(key)
                out.append({"name": re.sub(r"^(Mr|Ms|Mrs|Dr|Shri|Smt)\.?\s*", "", p["name"]).strip(),
                            "role": re.sub(r"\s*\(.*?\)", "", re.sub(r"\s+", " ", p["role"])).split(" and a ")[0].split(" · ")[-1].strip(),
                            "ts": f["ts"], "id": f["id"]})
    if len(out) < 2:
        return None
    who = "; ".join(f"{x['name']} ({x['role']}, {_short(x['ts'])})" for x in out)
    return {"kind": "exits", "severity": "flag", "lead": f"{len(out)} senior people left {name} within {days} days: {who}.",
            "filings": [x["id"] for x in out]}


def pledges(sym, name, filings, now):
    fs = [f for f in filings if f["category"] == "pledging" and f.get("url")]
    if not fs:
        return None
    # The SAST form's header lists "Creation / Release / Invocation"; the actual event is the word followed by a date.
    EVENT = re.compile(r"\b(creation|release|invocation)\s+(?=\d{1,2}(?:st|nd|rd|th)?[\s./-]\s*(?:\d|[A-Za-z]{3}))", re.I)
    rows = []
    for f in fs:
        t = re.sub(r"\s+", " ", pdf.text(f["url"], max_pages=6))
        ev = [m.group(1).lower() for m in EVENT.finditer(t)]
        rows.append({"ts": f["ts"], "events": ev, "id": f["id"], "age": (now - datetime.fromisoformat(f["ts"])).days})
    recent = [r for r in rows if r["age"] <= 90]
    before = [r for r in rows if 90 < r["age"] <= 180]
    cnt = lambda rs, k: sum(r["events"].count(k) for r in rs)  # noqa: E731
    rc, rr, ri = cnt(recent, "creation"), cnt(recent, "release"), cnt(recent, "invocation")
    trend = "more" if len(recent) > len(before) else "fewer" if len(recent) < len(before) else "as many"
    events = f"{rc} new pledge{'s' if rc != 1 else ''}, {rr} release{'s' if rr != 1 else ''}" + (f", {ri} invocation{'s' if ri != 1 else ''}" if ri else "")
    net = "promoters are pledging more" if rc > rr else "promoters are releasing pledges" if rr > rc else "pledges and releases balance out"
    lead = (f"{name}: {len(recent)} promoter pledge disclosures in the last 90 days ({trend} than the {len(before)} before); "
            f"{events}, so {net}.")
    sev = "flag" if ri or (rc > rr and rc >= 2) else "info"
    return {"kind": "pledging", "severity": sev, "lead": lead, "filings": [r["id"] for r in rows][:12],
            "counts": {"recent": len(recent), "before": len(before), "creation": rc, "release": rr, "invocation": ri}}


def for_stock(sym, name, filings, now):
    return [p for p in (credit(sym, name, filings), exits(sym, name, filings, now), pledges(sym, name, filings, now)) if p]
