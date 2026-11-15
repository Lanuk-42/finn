"""Page-level transcript index for the Research ask bar (no LLM): data/transcripts/<SYM>.json

  python scripts/transcripts.py            # latest 2 calls per holding, 5 for promise-tracker companies
"""
import io
import json
import sys
from pathlib import Path

import requests
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).resolve().parent))
from finn.config import DATA, PORTFOLIO, PROMISE_TICKERS, UA  # noqa: E402
from finn.promises import detect_quarter  # noqa: E402


def pages(url):
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Referer": "https://www.bseindia.com/"}, timeout=60)
    except requests.RequestException:
        return None
    if r.status_code != 200 or r.content[:4] != b"%PDF":
        return None
    try:
        return [(p.extract_text() or "") for p in PdfReader(io.BytesIO(r.content)).pages[:80]]
    except Exception:  # noqa: BLE001
        return None


def main():
    out_dir = DATA / "transcripts"
    out_dir.mkdir(exist_ok=True)
    for p in PORTFOLIO:
        sym = p["symbol"]
        want = 5 if sym in PROMISE_TICKERS else 2
        scr = json.loads((DATA / "screener" / f"{sym}.json").read_text())
        calls, seen = [], set()
        for c in scr.get("concalls", []):
            u = c.get("transcript_url")
            if not u or u in seen:
                continue
            seen.add(u)
            pg = pages(u)
            if not pg or sum(len(x) for x in pg) < 5000:
                continue
            q, _ = detect_quarter("\n".join(pg), c["period"])
            if any(x["quarter"] == q for x in calls):
                continue
            calls.append({"quarter": q, "label": c["period"], "url": u, "pages": [" ".join(x.split()) for x in pg]})
            if len(calls) >= want:
                break
        (out_dir / f"{sym}.json").write_text(json.dumps({"symbol": sym, "calls": calls}, ensure_ascii=False))
        print(sym, [c["quarter"] for c in calls], flush=True)


if __name__ == "__main__":
    main()
