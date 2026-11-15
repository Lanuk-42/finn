"""FINN brain: turns data/ into data/brief.json. Code decides every tier, number and verdict.

  python scripts/brain.py            # needs GEMINI_API_KEY only for management-change cards (cached after first run)
  python scripts/brain.py --no-llm   # skip Gemini; management cards show the BSE headline only
"""
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from finn import classify, gemini, management, pdf, results  # noqa: E402
from finn.config import DATA, PORTFOLIO  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
NO_LLM = "--no-llm" in sys.argv
MGMT_DAYS = 120   # management-change cards are built for filings this recent
MOVE_DAYS = 90    # trading-day rows kept for the Moves panel
TIER_ORDER = {"Act": 0, "Note": 1, "Routine": 2}
ACT_ORDER = ["results", "management_change", "litigation", "M&A", "fund_raise", "credit_rating", "pledging"]


def fid(f):
    return hashlib.sha1((f.get("url") or f.get("title", "") + f.get("ts", "")).encode()).hexdigest()[:12]


def load(p):
    return json.loads(Path(p).read_text())


def build_filings(sym, raw, scr, now):
    out = []
    for f in raw:
        first_page = None
        if classify.is_generic(f) and f.get("url"):
            first_page = pdf.text(f["url"], max_pages=2)
        c = classify.classify(f, first_page)
        out.append({"id": fid(f), "symbol": sym, "ts": f["ts"], "title": f.get("title"),
                    "headline": f.get("headline") or "", "url": f.get("url"), "source": f.get("source"),
                    "category": c["category"], "tier": c["tier"], "rule": c["rule"], "basis": c["basis"]})

    # One results card per quarter: the 'Financial Results' filing wins; other results-family filings that
    # land within 2 days are folded under it (tier -> Routine, reason recorded).
    q = scr.get("quarters")
    res = sorted([f for f in out if f["category"] == "results" and f["tier"] == "Act"], key=lambda f: f["ts"])
    primaries = {}
    for f in res:
        quarter = results.quarter_for_filing(f["ts"])
        cur = primaries.get(quarter)
        prefer = "financial result" in (f["title"] or "").lower() and "outcome" not in (f["title"] or "").lower()
        if cur is None or (prefer and "financial result" not in (cur["title"] or "").lower()):
            primaries[quarter] = f
    for quarter, f in primaries.items():
        f["card"] = {"type": "results", **results.card(q, quarter)}
        f["card"]["filing_url"] = f["url"]
    for f in out:
        if f["category"] == "results" and "card" not in f:
            qtr = results.quarter_for_filing(f["ts"])
            p = primaries.get(qtr)
            if p and abs((datetime.fromisoformat(f["ts"]) - datetime.fromisoformat(p["ts"])).days) <= 2:
                f["tier"], f["rule"], f["folded_into"] = "Routine", f["rule"] + "+folded", p["id"]

    # Management change cards
    for f in out:
        if f["category"] != "management_change" or f["rule"].startswith("auditor"):
            continue
        if (now - datetime.fromisoformat(f["ts"])).days > MGMT_DAYS:
            continue
        txt = pdf.text(f["url"]) if f.get("url") else ""
        if NO_LLM:
            f["card"] = {"type": "management", "people": [], "note": "LLM step skipped"}
            continue
        try:
            m = management.extract(txt, f["headline"])
        except Exception as e:  # noqa: BLE001
            m = {"people": [], "note": f"extraction failed: {str(e)[:80]}"}
        f["card"] = {"type": "management", **m}
        # Code-level tier correction: a verified departure/arrival in a top role is Act; pure reappointments are Note.
        top = any(p["change"] in ("joined", "left") and _is_top(p["role"]) for p in m["people"])
        if top:
            f["tier"] = "Act"
        elif m["people"] and all(p["change"] == "reappointed" for p in m["people"]):
            f["tier"] = "Note"
        elif m["people"]:
            f["tier"] = "Note"

    # Same people, same change, filed twice within 2 days (e.g. board outcome + separate intimation): keep one card.
    seen = {}
    for f in sorted(out, key=lambda f: f["ts"]):
        c = f.get("card")
        if not c or c["type"] != "management" or not c.get("people"):
            continue
        key = tuple(sorted((p["name"].lower(), p["change"]) for p in c["people"]))
        prev = seen.get(key)
        if prev and (datetime.fromisoformat(f["ts"]) - datetime.fromisoformat(prev["ts"])).days <= 2:
            f["tier"], f["folded_into"], f["rule"] = "Routine", prev["id"], f["rule"] + "+duplicate"
        else:
            seen[key] = f
    return out


def _is_top(role):
    r = (role or "").lower().replace("non-executive", "").replace("non executive", "").replace("independent", "")
    return any(k in r for k in ("chief executive", "ceo", "chief financial", "cfo", "managing director", "chair",
                                "whole-time", "whole time", "executive director", "chief operating", "coo"))


def build_moves(prices, filings):
    """Per trading day: % change, volume vs prior-20-day average, filings dated the same day or since the previous
    trading day. Thresholds are applied in the UI so the user can change them."""
    rows = prices["rows"]
    by_date = {}
    for f in filings:
        by_date.setdefault(f["ts"][:10], []).append(f)
    out = []
    for i in range(20, len(rows)):
        r, prev = rows[i], rows[i - 1]
        avg20 = sum(x["volume"] for x in rows[i - 20:i]) / 20
        linked = []
        d0, d1 = prev["date"], r["date"]
        for d, fs in by_date.items():
            if d0 <= d <= d1:
                linked += fs
        linked.sort(key=lambda f: (TIER_ORDER[f["tier"]], f["ts"]))
        out.append({"date": r["date"], "close": r["close"],
                    "pct": round((r["close"] - prev["close"]) / prev["close"] * 100, 2),
                    "volx": round(r["volume"] / avg20, 2) if avg20 else None,
                    "filings": [f["id"] for f in linked],
                    # explained = at least one linked filing is material (Act/Note); routine paperwork explains nothing
                    "explained": any(f["tier"] != "Routine" for f in linked)})
    return out[-MOVE_DAYS:]


def main():
    now = datetime.now(IST)
    ann = load(DATA / "announcements.json")
    report = load(DATA / "fetch_report.json")
    stocks, filings, moves = [], [], {}
    for p in PORTFOLIO:
        sym = p["symbol"]
        scr = load(DATA / "screener" / f"{sym}.json")
        prices = load(DATA / "prices" / f"{sym}.json")
        fl = build_filings(sym, ann.get(sym, []), scr, now)
        filings += fl
        moves[sym] = build_moves(prices, fl)
        last, prev = prices["rows"][-1], prices["rows"][-2]
        stocks.append({
            "symbol": sym, "name": p["name"], "sector": p["sector"], "cap": p["cap"],
            "thesis": results.thesis_check(p["thesis"], scr.get("quarters")),
            "close": last["close"], "date": last["date"],
            "day_pct": round((last["close"] - prev["close"]) / prev["close"] * 100, 2),
            "screener_variant": scr.get("variant"),
        })
        print(f"{sym}: {len(fl)} filings, " + ", ".join(
            f"{t}={sum(1 for f in fl if f['tier'] == t)}" for t in ("Act", "Note", "Routine")), flush=True)

    filings.sort(key=lambda f: f["ts"], reverse=True)
    latest_price = max(s["date"] for s in stocks)
    brief = {
        "generated_at": now.isoformat(timespec="seconds"),
        "data_as_of": max(report["finished_at"], filings[0]["ts"] if filings else ""),
        "latest_trading_day": latest_price,
        "fetch": {k: {"announcements": v["announcements"]["path"][-1]["source"] if v["announcements"]["path"] else None,
                      "prices": v["prices"].get("ok"), "screener": v["screener"].get("ok")}
                  for k, v in report["stocks"].items()},
        "act_order": ACT_ORDER,
        "stocks": stocks,
        "filings": filings,
        "moves": moves,
        "llm_usage": gemini.USAGE,
    }
    (DATA / "brief.json").write_text(json.dumps(brief, ensure_ascii=False, indent=1))
    print("wrote data/brief.json", gemini.USAGE)


if __name__ == "__main__":
    main()
