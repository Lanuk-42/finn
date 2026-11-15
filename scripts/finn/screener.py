"""screener.in fetch + parse. Pure parsing: no numbers are derived here, only read."""
import re
import time

import requests
from bs4 import BeautifulSoup

from .config import UA

BASE = "https://www.screener.in"
_session = requests.Session()
_session.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})


def _num(s):
    """'1,234' -> 1234.0, '26%' -> 26.0, '' -> None."""
    s = (s or "").replace(",", "").replace("%", "").replace("+", "").strip()
    if s in ("", "-", "--"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _get(path):
    for attempt in range(3):
        r = _session.get(BASE + path, timeout=30)
        if r.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        return r
    return r


def _table(section):
    """Parse a screener data table into {headers, rows{label: [values]}, links{label: [urls]}}."""
    if section is None:
        return None
    t = section.find("table", class_="data-table")
    if t is None:
        return None
    headers = [th.get_text(strip=True) for th in t.find("thead").find_all("th")][1:]
    rows, links = {}, {}
    for tr in t.find("tbody").find_all("tr"):
        tds = tr.find_all("td")
        if not tds:
            continue
        label = tds[0].get_text(" ", strip=True).replace("+", "").strip()
        cells = tds[1:]
        if label == "Raw PDF":
            links["raw_pdf"] = [
                (BASE + a["href"] if a["href"].startswith("/") else a["href"]) if (a := c.find("a")) else None
                for c in cells
            ]
            continue
        rows[label] = [_num(c.get_text(strip=True)) for c in cells]
    return {"headers": headers, "rows": rows, "links": links}


def _has_data(tbl):
    return bool(tbl and tbl["rows"] and any(v is not None for vals in tbl["rows"].values() for v in vals))


_MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def period_key(label):
    """'Sep 2026' -> 202609 (for ordering). None if not a month label."""
    m = re.match(r"([A-Z][a-z]{2}) (\d{4})", label or "")
    return int(m.group(2)) * 100 + _MONTHS[m.group(1)] if m else None


def _latest(parsed):
    q = parsed.get("quarters") if parsed else None
    if not _has_data(q):
        return 0
    return max((period_key(h) or 0) for h in q["headers"])


def fetch_company(symbol):
    """Parsed screener data for an NSE symbol. Takes consolidated unless standalone has newer quarters
    (some companies stop filing consolidated numbers, e.g. CAMPUS stops at Jun 2022)."""
    best = None
    for variant, path in (("consolidated", f"/company/{symbol}/consolidated/"), ("standalone", f"/company/{symbol}/")):
        r = _get(path)
        if r.status_code != 200:
            if best is None:
                best = {"ok": False, "error": f"HTTP {r.status_code} on {path}"}
            continue
        parsed = parse_company_html(r.text)
        parsed["variant"] = variant
        parsed["url"] = BASE + path
        if best is None or not best.get("ok") or _latest(parsed) > _latest(best):
            best = parsed
        if variant == "consolidated" and _latest(parsed) >= _recent_cutoff():
            break  # consolidated is current; no need to fetch standalone
        time.sleep(1)
    return best


def _recent_cutoff():
    """Quarter key ~7 months ago; anything older than that is stale."""
    import datetime as _dt
    d = _dt.date.today() - _dt.timedelta(days=210)
    return d.year * 100 + d.month


def parse_company_html(html):
    s = BeautifulSoup(html, "lxml")
    h1 = s.find("h1")
    about = s.find("div", class_="about")
    ratios = {}
    tr = s.find(id="top-ratios")
    if tr:
        for li in tr.find_all("li"):
            name = li.find(class_="name")
            val = li.find(class_="value")
            if name and val:
                ratios[name.get_text(" ", strip=True)] = val.get_text(" ", strip=True).replace("\n", " ")
    bse = re.search(r"bseindia\.com/stock-share-price/[^/]+/[^/]+/(\d+)/", html)
    cid = re.search(r'data-company-id="(\d+)"', html)

    # Concalls: period + transcript link (primary source only: BSE / company site).
    concalls = []
    for li in s.select("div.concalls ul.list-links li, #documents .concalls li"):
        period = li.find("div")
        tlink = li.find("a", title="Raw Transcript")
        concalls.append({
            "period": period.get_text(strip=True) if period else None,
            "transcript_url": tlink["href"] if tlink else None,
        })
    if not concalls:  # layout fallback: find the "Concalls" header and walk its list
        hdr = s.find("h3", string=re.compile("Concalls"))
        box = hdr.find_parent("div").find_next("ul") if hdr else None
        for li in (box.find_all("li", recursive=False) if box else []):
            period = li.find("div")
            tlink = li.find("a", title="Raw Transcript")
            concalls.append({
                "period": period.get_text(strip=True) if period else None,
                "transcript_url": tlink["href"] if tlink else None,
            })

    # Recent BSE filings listed on the page. Screener's own AI one-liner (the grey sub-line) is dropped on purpose.
    filings = []
    tab = s.find(id="company-announcements-tab")
    for a in (tab.select("ul.list-links li a") if tab else []):
        t = a.find("time")
        sub = a.find("div")
        if sub:
            sub.extract()
        filings.append({
            "title": a.get_text(" ", strip=True),
            "ts": t["datetime"] if t and t.has_attr("datetime") else None,
            "url": a["href"],
        })

    return {
        "ok": True,
        "name": h1.get_text(strip=True) if h1 else None,
        "about": about.get_text(" ", strip=True) if about else None,
        "ratios": ratios,
        "bse_code": bse.group(1) if bse else None,
        "screener_id": cid.group(1) if cid else None,
        "quarters": _table(s.find(id="quarters")),
        "annual": _table(s.find(id="profit-loss")),
        "balance_sheet": _table(s.find(id="balance-sheet")),
        "cash_flow": _table(s.find(id="cash-flow")),
        "ratios_table": _table(s.find(id="ratios")),
        "concalls": concalls,
        "filings": filings,
    }
