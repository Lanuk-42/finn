"""Thin Gemini client (OpenAI-compatible endpoint). Key comes from env GEMINI_API_KEY only, never from code.

- Streams responses: long thinking calls otherwise sit silent past network idle timeouts.
- Falls back across models on overload (503) or exhausted daily quota (free tier = 20 requests/day *per model*).
- Caches every parsed response on disk by (first-choice model, prompt) hash, so reruns cost nothing.
"""
import hashlib
import json
import os
import time

import requests

from .config import DATA

URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
CACHE = DATA / "cache" / "llm"

# Routing: short filings -> lite model; long transcripts -> best available flash, lite as last resort.
CHEAP = ["gemini-3.5-flash-lite"]
STRONG = [m for m in os.environ.get("FINN_STRONG_MODELS", "").split(",") if m] or [
    "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]

USAGE = {"calls": 0, "cached": 0, "prompt_tokens": 0, "completion_tokens": 0, "by_model": {}}


class QuotaExceeded(RuntimeError):
    pass


class BudgetExceeded(RuntimeError):
    pass


# Hard cap on NEW (uncached) calls per run: FINN_LLM_BUDGET=12 python scripts/brain.py
# FINN_LLM_BUDGET=0 means no new calls at all (cache only); unset means no cap.
BUDGET = int(os.environ["FINN_LLM_BUDGET"]) if os.environ.get("FINN_LLM_BUDGET", "").strip() else None


def _stream(model, body, key):
    r = requests.post(URL, json={**body, "model": model, "stream": True,
                                 "stream_options": {"include_usage": True}},
                      timeout=(15, 120), stream=True, headers={"Authorization": f"Bearer {key}"})
    if r.status_code != 200:
        return r.status_code, r.text, None
    parts, usage = [], {}
    for line in r.iter_lines():
        s = line.decode("utf-8", "replace")
        if not s.startswith("data: ") or s[6:] == "[DONE]":
            continue
        j = json.loads(s[6:])
        usage = j.get("usage") or usage
        for c in j.get("choices", []):
            parts.append((c.get("delta") or {}).get("content") or "")
    return 200, "".join(parts), usage


# FINN_LITE_ONLY=1 (the scheduled GitHub Actions run) restricts every call to lite models.
LITE_ONLY = os.environ.get("FINN_LITE_ONLY") == "1"


def ask_json(system, user, models=CHEAP, rounds=3):
    models = [models] if isinstance(models, str) else list(models)
    CACHE.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha256(f"{models[0]}\n{system}\n{user}".encode()).hexdigest()[:24]
    p = CACHE / f"{h}.json"
    if p.exists():  # cache first: a run without a key still reuses every earlier answer
        USAGE["cached"] += 1
        return json.loads(p.read_text())["parsed"]
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise BudgetExceeded("GEMINI_API_KEY is not set; skipping new LLM calls")
    if LITE_ONLY:
        models = [m for m in models if "lite" in m]
        if not models:
            raise BudgetExceeded("lite-only run: this task has no lite model")
    if BUDGET is not None and USAGE["calls"] >= BUDGET:
        raise BudgetExceeded(f"LLM budget of {BUDGET} new calls used")
    body = {"temperature": 0, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    dead, last = set(), ""
    for rnd in range(rounds):
        for model in models:
            if model in dead:
                continue
            try:
                code, text, usage = _stream(model, body, key)
            except requests.RequestException as e:
                last = f"{model}: {e}"
                continue
            if code == 429 and "per day" in text.lower():
                dead.add(model)  # this model's daily free quota is gone; try the next one
                last = f"{model}: daily quota"
                continue
            if code != 200:
                last = f"{model}: HTTP {code} {text[:120]}"
                continue
            content = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                last = f"{model}: non-JSON reply"
                continue
            USAGE["calls"] += 1
            USAGE["prompt_tokens"] += usage.get("prompt_tokens", 0)
            USAGE["completion_tokens"] += usage.get("completion_tokens", 0)
            USAGE["by_model"][model] = USAGE["by_model"].get(model, 0) + 1
            p.write_text(json.dumps({"model": model, "usage": usage, "parsed": parsed}, ensure_ascii=False))
            return parsed
        if len(dead) == len(models):
            raise QuotaExceeded("daily free-tier quota used up on every model in the chain")
        time.sleep(20 * (rnd + 1))
    raise RuntimeError(f"Gemini failed: {last}")
