"""Thin Gemini client (OpenAI-compatible endpoint). Key comes from env GEMINI_API_KEY only.
Every response is cached on disk by prompt hash, so reruns cost nothing."""
import hashlib
import json
import os
import time

import requests

from .config import DATA

URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
CACHE = DATA / "cache" / "llm"
CHEAP = "gemini-3.5-flash-lite"   # short filings: who joined/left
STRONG = "gemini-3.5-flash"       # long concall transcripts: guidance extraction
USAGE = {"calls": 0, "cached": 0, "prompt_tokens": 0, "completion_tokens": 0}


def ask_json(system, user, model=CHEAP, retries=3):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    CACHE.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha256(f"{model}\n{system}\n{user}".encode()).hexdigest()[:24]
    p = CACHE / f"{h}.json"
    if p.exists():
        USAGE["cached"] += 1
        return json.loads(p.read_text())["parsed"]
    body = {"model": model, "temperature": 0, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    for attempt in range(retries):
        r = requests.post(URL, json=body, timeout=180, headers={"Authorization": f"Bearer {key}"})
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(10 * (attempt + 1))
            continue
        r.raise_for_status()
        j = r.json()
        content = j["choices"][0]["message"]["content"]
        content = content.strip().removeprefix("```json").removesuffix("```").strip()
        parsed = json.loads(content)
        u = j.get("usage", {})
        USAGE["calls"] += 1
        USAGE["prompt_tokens"] += u.get("prompt_tokens", 0)
        USAGE["completion_tokens"] += u.get("completion_tokens", 0)
        p.write_text(json.dumps({"model": model, "usage": u, "parsed": parsed}, ensure_ascii=False))
        return parsed
    raise RuntimeError(f"Gemini failed after {retries} tries: HTTP {r.status_code} {r.text[:200]}")
