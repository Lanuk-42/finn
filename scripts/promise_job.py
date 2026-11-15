"""On-demand promise tracker for any NSE ticker, in stages (each stage is one GitHub Actions step, so the app can show progress):

  python scripts/promise_job.py fetch SYM         # screener tables + concall links
  python scripts/promise_job.py transcripts SYM   # download the latest transcripts (no LLM)
  python scripts/promise_job.py extract SYM       # a model finds guidance; code checks every quote, maps and scores
Same engine and checks as the precomputed trackers. Transcripts go to the best available Flash model first, then the
other Flash models, then lite (gemini.STRONG). Hard budget: FINN_LLM_BUDGET=6.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from finn import gemini, pdf, promises, screener  # noqa: E402
from finn.config import DATA  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
N_CALLS = 4


def latest_transcripts(scr, n=N_CALLS + 2):
    seen = []
    for c in scr.get("concalls", []):
        u = c.get("transcript_url")
        if u and u not in seen:
            seen.append(u)
        if len(seen) >= n:
            break
    return seen


def main(stage, sym):
    sym = sym.upper().strip()
    f = DATA / "screener" / f"{sym}.json"
    if stage == "fetch":
        scr = screener.fetch_company(sym) or {"ok": False}
        if not scr.get("ok") or not scr.get("quarters"):
            sys.exit(f"{sym}: not found on screener.in")
        scr["fetched_at"] = datetime.now(IST).isoformat(timespec="seconds")
        f.write_text(json.dumps(scr, ensure_ascii=False, indent=1))
        print(f"{sym}: {scr.get('name')} ({scr.get('variant')}), {sum(1 for c in scr.get('concalls', []) if c.get('transcript_url'))} transcript links")
    elif stage == "transcripts":
        scr = json.loads(f.read_text())
        ok = sum(1 for u in latest_transcripts(scr) if len(pdf.text(u, max_pages=80)) > 5000)
        print(f"{sym}: {ok} readable transcripts")
    elif stage == "extract":
        scr = json.loads(f.read_text())
        out = promises.run(sym, scr, max_transcripts=N_CALLS)
        out["generated_at"] = datetime.now(IST).isoformat(timespec="seconds")
        out["company"] = scr.get("name")
        out["on_demand"] = True
        (DATA / "promises").mkdir(exist_ok=True)
        (DATA / "promises" / f"{sym}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
        c = out["credibility"]
        print(f"{sym}: {len(out['promises'])} checkable promises, kept {c['kept']}/{c['resolved']}; LLM {gemini.USAGE}")
    else:
        sys.exit(f"unknown stage {stage}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
