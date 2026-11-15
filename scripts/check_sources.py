"""Which data sources are reachable from here? Never fails: prints a table and writes data/source_check.json.
Run first in the scheduled GitHub Actions job so a blocked source is visible, not a crash."""
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from finn.config import DATA, UA  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
H = {"User-Agent": UA, "Accept": "application/json, text/html, */*", "Accept-Language": "en-US,en;q=0.9"}


def probe(name, fn):
    t0 = time.time()
    try:
        ok, detail = fn()
    except Exception as e:  # noqa: BLE001
        ok, detail = False, f"{type(e).__name__}: {str(e)[:120]}"
    return {"source": name, "ok": ok, "detail": detail, "ms": int((time.time() - t0) * 1000)}


def nse_api():
    r = requests.get("https://www.nseindia.com/", headers=H, timeout=15)
    return r.status_code == 200, f"homepage HTTP {r.status_code}"


def nse_rss():
    r = requests.get("https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml", headers=H, timeout=15)
    return r.status_code == 200 and b"<item>" in r.content, f"HTTP {r.status_code}, {r.content.count(b'<item>')} items"


def bse_api():
    to = datetime.now(IST)
    r = requests.get("https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w", timeout=20,
                     headers={**H, "Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com"},
                     params={"pageno": 1, "strCat": -1, "strPrevDate": (to - timedelta(days=30)).strftime("%Y%m%d"),
                             "strScrip": "500325", "strSearch": "P", "strToDate": to.strftime("%Y%m%d"), "strType": "C", "subcategory": -1})
    n = len(r.json().get("Table", [])) if r.status_code == 200 else 0
    return r.status_code == 200 and n > 0, f"HTTP {r.status_code}, {n} filings for RELIANCE"


def yahoo():
    import yfinance as yf
    df = yf.Ticker("RELIANCE.NS").history(period="5d")
    return not df.empty, f"{len(df)} rows"


def screener():
    r = requests.get("https://www.screener.in/company/TCS/consolidated/", headers=H, timeout=20)
    return r.status_code == 200 and 'id="quarters"' in r.text, f"HTTP {r.status_code}"


if __name__ == "__main__":
    res = [probe(n, f) for n, f in (("NSE API", nse_api), ("NSE RSS", nse_rss), ("BSE API", bse_api),
                                     ("Yahoo Finance", yahoo), ("screener.in", screener))]
    for r in res:
        print(f"{'OK  ' if r['ok'] else 'FAIL'} {r['source']:<14} {r['detail']}  ({r['ms']} ms)")
    out = {"checked_at": datetime.now(IST).isoformat(timespec="seconds"), "results": res}
    (DATA / "source_check.json").write_text(json.dumps(out, indent=1))
