"""Results card + thesis check. Every number here is read from screener tables or computed in code."""
from datetime import date, datetime

from .screener import period_key

QEND = {3: 31, 6: 30, 9: 30, 12: 31}
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def quarter_for_filing(ts):
    """Label of the last quarter that ended strictly before the filing date, e.g. 'Sep 2026'."""
    d = datetime.fromisoformat(ts).date()
    y, m = d.year, d.month
    for _ in range(5):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        if m in QEND and date(y, m, QEND[m]) < d:
            return f"{MON[m - 1]} {y}"
    return None


def _row(rows, *names):
    for n in names:
        if n in rows:
            return rows[n]
    return None


def lines(q):
    """Map a screener quarters table to the four headline lines. EBITDA = screener 'Operating Profit'
    (sales - operating expenses, before other income, D&A, interest, tax). Banks have no EBITDA line."""
    rows = q["rows"]
    is_bank = "Financing Profit" in rows
    return {
        "revenue": _row(rows, "Sales", "Revenue"),
        "ebitda": None if is_bank else _row(rows, "Operating Profit"),
        "pbt": _row(rows, "Profit before tax"),
        "pat": _row(rows, "Net Profit"),
    }, is_bank


def pct(cur, base):
    if cur is None or base is None or base <= 0:
        return None  # growth on a zero/negative base is not meaningful
    return round((cur - base) / base * 100, 1)


def margin(num, den):
    if num is None or not den:
        return None
    return round(num / den * 100, 1)


def card(q, quarter_label):
    """Results card for `quarter_label` from a screener quarters table, or a pending stub."""
    if not q or quarter_label not in q["headers"]:
        latest = q["headers"][-1] if q else None
        return {"status": "pending", "quarter": quarter_label,
                "note": f"Screener table not yet updated for {quarter_label} (latest: {latest})."}
    i = q["headers"].index(quarter_label)
    L, is_bank = lines(q)
    out = {"status": "ok", "quarter": quarter_label, "is_bank": is_bank,
           "prev_quarter": q["headers"][i - 1] if i >= 1 else None,
           "year_ago": q["headers"][i - 4] if i >= 4 else None, "lines": {}}
    for k, vals in L.items():
        if vals is None:
            out["lines"][k] = None
            continue
        cur = vals[i]
        prev = vals[i - 1] if i >= 1 else None
        ya = vals[i - 4] if i >= 4 else None
        out["lines"][k] = {"value": cur, "prev": prev, "year_ago": ya, "qoq": pct(cur, prev), "yoy": pct(cur, ya)}
    rev = L["revenue"]
    if L["ebitda"] and rev:
        m = [margin(L["ebitda"][j], rev[j]) if j >= 0 else None for j in (i, i - 1, i - 4)]
        out["ebitda_margin"] = {"value": m[0], "prev": m[1], "year_ago": m[2],
                                "qoq_pp": round(m[0] - m[1], 1) if None not in m[:2] else None,
                                "yoy_pp": round(m[0] - m[2], 1) if m[0] is not None and m[2] is not None else None}
    raw = (q.get("links") or {}).get("raw_pdf") or []
    out["raw_pdf"] = raw[i] if i < len(raw) else None
    return out


def metric_value(q, metric):
    """Latest-quarter value of a thesis metric. Returns (value, quarter_label) or (None, label)."""
    if not q:
        return None, None
    L, is_bank = lines(q)
    i = len(q["headers"]) - 1
    lab = q["headers"][i]
    rev, pat, ebitda = L["revenue"], L["pat"], L["ebitda"]
    if metric == "ebitda_margin":
        return (margin(ebitda[i], rev[i]) if ebitda and rev else None), lab
    if metric == "pat_margin":
        return (margin(pat[i], rev[i]) if pat and rev else None), lab
    if metric == "revenue_yoy":
        return (pct(rev[i], rev[i - 4]) if rev and i >= 4 else None), lab
    if metric == "pat_yoy":
        return (pct(pat[i], pat[i - 4]) if pat and i >= 4 else None), lab
    raise ValueError(metric)


METRIC_LABEL = {"ebitda_margin": "EBITDA margin", "pat_margin": "PAT margin",
                "revenue_yoy": "Revenue growth YoY", "pat_yoy": "PAT growth YoY"}


def thesis_check(thesis, q):
    val, lab = metric_value(q, thesis["metric"])
    rule = f'{METRIC_LABEL[thesis["metric"]]} {thesis["op"]} {thesis["value"]}%'
    if val is None:
        return {**thesis, "rule": rule, "actual": None, "quarter": lab, "status": "n/a"}
    ok = val >= thesis["value"] if thesis["op"] == ">=" else val <= thesis["value"]
    return {**thesis, "rule": rule, "actual": val, "quarter": lab, "status": "ok" if ok else "breach"}
