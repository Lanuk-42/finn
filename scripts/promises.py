"""Precompute promise trackers for PROMISE_TICKERS -> data/promises/<SYM>.json

  GEMINI_API_KEY=... python scripts/promises.py [SYM ...]
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from finn import gemini, promises  # noqa: E402
from finn.config import DATA, PROMISE_TICKERS  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))

if __name__ == "__main__":
    syms = [s.upper() for s in sys.argv[1:]] or list(PROMISE_TICKERS)
    for sym in syms:
        scr = json.loads((DATA / "screener" / f"{sym}.json").read_text())
        out = promises.run(sym, scr, max_transcripts=PROMISE_TICKERS.get(sym, 5))
        out["generated_at"] = datetime.now(IST).isoformat(timespec="seconds")
        out["company"] = scr.get("name")
        (DATA / "promises").mkdir(exist_ok=True)
        (DATA / "promises" / f"{sym}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
        c = out["credibility"]
        print(f"{sym}: transcripts={[t.get('quarter') or t['status'] for t in out['transcripts']]} "
              f"promises={len(out['promises'])} kept {c['kept']}/{c['resolved']} in_progress={c['in_progress']} "
              f"not_checkable={len(out['not_checkable'])} rejected={len(out['rejected'])}", flush=True)
    print("LLM usage", gemini.USAGE)
