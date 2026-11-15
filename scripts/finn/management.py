"""Management change card. Gemini only finds and quotes; code verifies every quote and decides joined/left."""
import re

from . import gemini
from .verify import norm, quote_in_text

SYSTEM = ("You read Indian stock-exchange filings. You only copy text verbatim from the filing you are given. "
          "Never use outside knowledge, never paraphrase inside a quote field. Output JSON only.")

PROMPT = """Filing text (between <<< >>>):
<<<
{text}
>>>

List every person whose position changes in this filing (appointed, resigned, retired, ceased, re-appointed, redesignated).
Return JSON: {{"people": [{{
  "name": "full name as written in the filing",
  "role": "the position, as written in the filing",
  "change": "joined" | "left" | "reappointed" | "redesignated",
  "effective_date": "as written, or null",
  "evidence_quote": "an exact sentence or clause from the filing that states this change",
  "tenure_quote": "exact text stating how long the person served / their term, or null if the filing does not say",
  "bio_quote": "for joined/reappointed only: exact 1-3 consecutive sentences from the filing describing the person's background (education, past roles). null if absent"
}}]}}
Every *_quote value must be copied character-for-character from the filing. If no person changes position, return {{"people": []}}."""

_JOIN = re.compile(r"appoint|join|induct|elevat|designat|nominat|co-?opt")
_LEFT = re.compile(r"resign|ceas|retire|step(s|ped)? down|demise|vacat|relinquish|superannuat|complet\w* (his|her|their) term")
_SENT = re.compile(r"(?<=[a-z0-9\)][.!?])\s+(?=[A-Z])")


def _two_sentences(s):
    parts = _SENT.split(re.sub(r"\s+", " ", s).strip())
    return " ".join(parts[:2])


def extract(text, headline="", url=None):
    """Return {'people': [...verified...], 'dropped': n}. `text` is the filing's PDF text (or headline fallback)."""
    src = (text or "").strip() or headline
    if len(src) < 40:
        return {"people": [], "dropped": 0, "note": "Filing text not readable"}
    raw = gemini.ask_json(SYSTEM, PROMPT.format(text=src[:30000]), key=f"mgmt:v1:{url}" if url else None)
    if isinstance(raw, list):  # some models return the bare array
        raw = {"people": raw}
    people, dropped = [], 0
    for p in raw.get("people", []):
        name = (p.get("name") or "").strip()
        ev = p.get("evidence_quote") or ""
        # 1) name and evidence must be in the filing
        surname = name.split()[-1] if name else ""
        if not name or norm(surname) not in norm(src) or not quote_in_text(ev, src):
            dropped += 1
            continue
        # 2) code decides joined/left from the verified evidence, not from the model's label
        e = norm(ev)
        if "re-appoint" in e or "reappoint" in e or "re appoint" in e:
            change = "reappointed"
        elif _LEFT.search(e) and not _JOIN.search(e):
            change = "left"
        elif _JOIN.search(e) and not _LEFT.search(e):
            change = "joined"
        elif p.get("change") in ("joined", "left", "redesignated", "reappointed") and (_JOIN.search(e) or _LEFT.search(e)):
            change = p["change"]  # evidence mentions both; accept the label only because the evidence supports either
        else:
            dropped += 1
            continue
        tenure = p.get("tenure_quote")
        tenure = tenure if tenure and quote_in_text(tenure, src) else None
        bio = p.get("bio_quote")
        bio = _two_sentences(bio) if bio and quote_in_text(bio, src) and change != "left" else None
        people.append({"name": name, "role": (p.get("role") or "").strip(), "change": change,
                       "effective_date": p.get("effective_date"), "evidence": ev.strip(),
                       "tenure": tenure, "bio": bio})
    # Same person, several roles in one filing (e.g. Additional Director + MD & CEO) -> one entry.
    merged = {}
    for p in people:
        k = (norm(p["name"]).replace("mr. ", "").replace("ms. ", "").replace("mrs. ", ""), p["change"])
        if k in merged:
            m = merged[k]
            m["role"] = m["role"] if p["role"].lower() in m["role"].lower() else f'{m["role"]} · {p["role"]}'
            m["bio"] = m["bio"] or p["bio"]
            m["tenure"] = m["tenure"] or p["tenure"]
        else:
            merged[k] = dict(p)
    return {"people": list(merged.values()), "dropped": dropped,
            **({"note": "Scanned filing: text not machine-readable"} if not (text or "").strip() else {})}
