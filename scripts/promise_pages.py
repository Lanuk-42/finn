"""Add the transcript page number to every quote in the saved promise trackers (code only, no model).

  python scripts/promise_pages.py [SYM ...]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from finn import pdf  # noqa: E402
from finn.config import DATA  # noqa: E402


def add_pages(tracker):
    found = missing = 0
    rows = tracker["promises"] + tracker.get("not_checkable", []) + tracker.get("rejected", [])
    rows += [f for p in tracker["promises"] for f in p.get("followups", [])]
    for r in rows:
        if not r.get("quote") or not r.get("source_url"):
            continue
        r["page"] = pdf.page_of(r["quote"], pdf.pages(r["source_url"]))
        found += r["page"] is not None
        missing += r["page"] is None
    return found, missing


if __name__ == "__main__":
    syms = [s.upper() for s in sys.argv[1:]] or [p.stem for p in sorted((DATA / "promises").glob("*.json"))]
    for sym in syms:
        f = DATA / "promises" / f"{sym}.json"
        t = json.loads(f.read_text())
        found, missing = add_pages(t)
        f.write_text(json.dumps(t, indent=1, ensure_ascii=False))
        print(f"{sym}: {found} quotes placed on a page, {missing} not placed", flush=True)
