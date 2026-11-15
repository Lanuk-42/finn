"""FINN data fetch: EOD prices (yfinance), announcements (NSE -> BSE -> fallbacks), screener tables.

Usage:  python scripts/fetch.py            # all portfolio stocks
        python scripts/fetch.py TCS DIXON  # subset

Writes:
  data/prices/<SYM>.json        daily OHLCV, last ~6 months
  data/screener/<SYM>.json      parsed screener page (tables, ratios, concall links, recent BSE filings)
  data/announcements.json       {SYM: [filing,...]}  merged with earlier runs, so history accumulates
  data/fetch_report.json        which source worked / failed, per stock, with timestamps
"""
import json
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import requests

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from finn import screener  # noqa: E402
from finn.config import DATA, PORTFOLIO, UA  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))


def now_iso():
    return datetime.now(IST).isoformat(timespec="seconds")


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False))


# ---------------------------------------------------------------- prices
def fetch_prices(symbol):
    import yfinance as yf
    df = yf.Ticker(f"{symbol}.NS").history(period="6mo", auto_adjust=False)
    if df.empty:
        df = yf.Ticker(f"{symbol}.BO").history(period="6mo", auto_adjust=False)
    if df.empty:
        raise RuntimeError("yfinance returned no rows for .NS or .BO")
    rows = [{
        "date": idx.strftime("%Y-%m-%d"),
        "open": round(float(r["Open"]), 2), "high": round(float(r["High"]), 2),
        "low": round(float(r["Low"]), 2), "close": round(float(r["Close"]), 2),
        "volume": int(r["Volume"]),
    } for idx, r in df.iterrows()]
    return rows


# ---------------------------------------------------------------- announcements
def _http():
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept": "application/json, text/plain, */*",
                      "Accept-Language": "en-US,en;q=0.9"})
    return s


def nse_api(symbol, days=30):
    """Try 1: NSE corporate-announcements JSON API (needs cookies from the homepage)."""
    s = _http()
    s.headers["Referer"] = "https://www.nseindia.com/companies-listing/corporate-filings-announcements"
    home = s.get("https://www.nseindia.com/", timeout=15)
    if home.status_code != 200:
        raise RuntimeError(f"NSE homepage HTTP {home.status_code}")
    to = datetime.now(IST)
    fr = to - timedelta(days=days)
    r = s.get("https://www.nseindia.com/api/corporate-announcements", timeout=20, params={
        "index": "equities", "symbol": symbol,
        "from_date": fr.strftime("%d-%m-%Y"), "to_date": to.strftime("%d-%m-%Y")})
    if r.status_code != 200:
        raise RuntimeError(f"NSE API HTTP {r.status_code}")
    out = []
    for a in r.json():
        ts = datetime.strptime(a["an_dt"], "%d-%b-%Y %H:%M:%S").replace(tzinfo=IST)
        out.append({"ts": ts.isoformat(), "title": f'{a.get("desc", "")} - {a.get("attchmntText", "")}'.strip(" -"),
                    "url": a.get("attchmntFile"), "source": "nse_api"})
    return out


def bse_api(bse_code, days=180):
    """Try 2: BSE announcements JSON API (paged, 50 rows/page)."""
    if not bse_code:
        raise RuntimeError("no BSE code")
    s = _http()
    s.headers.update({"Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com"})
    to = datetime.now(IST)
    fr = to - timedelta(days=days)
    out, page = [], 1
    while True:
        r = s.get("https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w", timeout=20, params={
            "pageno": page, "strCat": -1, "strPrevDate": fr.strftime("%Y%m%d"), "strScrip": bse_code,
            "strSearch": "P", "strToDate": to.strftime("%Y%m%d"), "strType": "C", "subcategory": -1})
        if r.status_code != 200:
            raise RuntimeError(f"BSE API HTTP {r.status_code}")
        j = r.json()
        rows = j.get("Table", [])
        for a in rows:
            ts = datetime.fromisoformat(a["NEWS_DT"].split(".")[0]).replace(tzinfo=IST)
            att = a.get("ATTACHMENTNAME")
            out.append({
                "ts": ts.isoformat(), "title": (a.get("NEWSSUB") or "").strip(),
                "headline": (a.get("HEADLINE") or "").strip(),  # the company's own one-liner (primary text)
                "category": a.get("CATEGORYNAME"), "subcategory": a.get("SUBCATNAME"),
                "url": f"https://www.bseindia.com/xml-data/corpfiling/AttachHis/{att}" if att else None,
                "source": "bse_api"})
        total = (j.get("Table1") or [{}])[0].get("ROWCNT", 0)
        if not rows or len(out) >= total or page >= 10:
            break
        page += 1
        time.sleep(0.5)
    return out


_rss_cache = None


def nse_rss():
    """Exchange-wide latest filings from NSE's public RSS (no per-stock history). Cached per run."""
    global _rss_cache
    if _rss_cache is not None:
        return _rss_cache
    r = _http().get("https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml", timeout=20)
    r.raise_for_status()
    items = []
    for it in ET.fromstring(r.content).iter("item"):
        link = it.findtext("link") or ""
        desc = it.findtext("description") or ""
        sym = link.rsplit("/", 1)[-1].split("_", 1)[0].upper()
        subject = desc.split("|SUBJECT:", 1)[-1].strip() if "|SUBJECT:" in desc else desc
        ts = datetime.strptime(it.findtext("pubDate"), "%d-%b-%Y %H:%M:%S").replace(tzinfo=IST)
        items.append({"symbol": sym, "ts": ts.isoformat(), "title": subject, "detail": desc,
                      "url": link, "source": "nse_rss"})
    _rss_cache = items
    return items


def fetch_announcements(symbol, scr):
    """NSE API -> BSE API -> (NSE RSS + screener's BSE filing list). Returns (filings, path_log)."""
    log = []
    for name, fn in (("nse_api", lambda: nse_api(symbol)), ("bse_api", lambda: bse_api(scr.get("bse_code")))):
        try:
            got = fn()
            log.append({"source": name, "ok": True, "n": len(got)})
            return got, log
        except Exception as e:  # noqa: BLE001
            log.append({"source": name, "ok": False, "error": str(e)[:120]})
    got = []
    try:
        mine = [dict(i) for i in nse_rss() if i["symbol"] == symbol]
        for i in mine:
            i.pop("symbol")
        got += mine
        log.append({"source": "nse_rss", "ok": True, "n": len(mine)})
    except Exception as e:  # noqa: BLE001
        log.append({"source": "nse_rss", "ok": False, "error": str(e)[:120]})
    sf = [{**f, "source": "screener_bse"} for f in (scr.get("filings") or [])]
    got += sf
    log.append({"source": "screener_bse", "ok": bool(scr.get("ok")), "n": len(sf)})
    return got, log


def merge_filings(old, new):
    """Union by URL (or title+ts). Keeps history from earlier runs."""
    seen, out = set(), []
    for f in new + old:
        key = f.get("url") or f'{f.get("title")}|{f.get("ts")}'
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
    return sorted(out, key=lambda f: f.get("ts") or "", reverse=True)


# ---------------------------------------------------------------- main
def main(symbols):
    rep_path = DATA / "fetch_report.json"
    report = json.loads(rep_path.read_text()) if rep_path.exists() else {"stocks": {}}
    report["run_at"] = now_iso()  # stocks not fetched this run keep their previous entry
    ann_path = DATA / "announcements.json"
    ann_all = json.loads(ann_path.read_text()) if ann_path.exists() else {}

    for sym in symbols:
        rep = {}
        print(f"[{sym}]", flush=True)

        # prices
        try:
            rows = fetch_prices(sym)
            write_json(DATA / "prices" / f"{sym}.json", {"symbol": sym, "fetched_at": now_iso(), "rows": rows})
            rep["prices"] = {"ok": True, "source": "yfinance", "n": len(rows), "last": rows[-1]["date"]}
        except Exception as e:  # noqa: BLE001
            rep["prices"] = {"ok": False, "source": "yfinance", "error": str(e)[:160]}
        print("  prices", rep["prices"], flush=True)

        # screener
        try:
            scr = screener.fetch_company(sym) or {"ok": False}
            scr["fetched_at"] = now_iso()
            write_json(DATA / "screener" / f"{sym}.json", scr)
            q = scr.get("quarters") or {}
            rep["screener"] = {"ok": scr.get("ok", False), "variant": scr.get("variant"),
                               "last_quarter": (q.get("headers") or [None])[-1],
                               "concalls_with_transcript": sum(1 for c in scr.get("concalls", []) if c["transcript_url"])}
        except Exception as e:  # noqa: BLE001
            scr = {"ok": False}
            rep["screener"] = {"ok": False, "error": str(e)[:160]}
        print("  screener", rep["screener"], flush=True)

        # announcements
        filings, log = fetch_announcements(sym, scr)
        ann_all[sym] = merge_filings(ann_all.get(sym, []), filings)
        rep["announcements"] = {"path": log, "stored_total": len(ann_all[sym])}
        print("  announcements", log, flush=True)

        report["stocks"][sym] = rep
        time.sleep(1.5)  # be polite to screener

    write_json(ann_path, ann_all)
    report["finished_at"] = now_iso()
    write_json(DATA / "fetch_report.json", report)
    return report


if __name__ == "__main__":
    syms = [s.upper() for s in sys.argv[1:]] or [p["symbol"] for p in PORTFOLIO]
    main(syms)
