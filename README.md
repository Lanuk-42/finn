# FINN

A mobile-first daily brief for an Indian equity portfolio. It shows only what changed and why it matters, and a promise tracker checks management's guidance against the reported numbers.

**Rule: the AI only finds and quotes. Code checks every quote, computes every number and decides every verdict.**

## What it does

**Brief (push)**
- Portfolio: 18 stocks across sectors and sizes, including a PSU (BEL), two pharma (Sun, Lupin), an NBFC (Cholamandalam), a bank and three small caps.
- Header: *As of [time], X filings checked, Y need your attention*, with a window picker (24h / 3 days / 7 days / 30 days). The default is the smallest window with at least 3 Act items.
- **Thesis breaches** sit at the top. Each holding has a pre-filled thesis line (why I own it + one metric, e.g. EBITDA margin ≥ 18%). Code checks it against the latest quarter.
- **Act** cards:
  - **Results card:** Revenue, EBITDA, PBT and PAT, with QoQ and YoY computed in code from screener tables, plus a one-line read.
  - **Management change card:** who left (with tenure, if the filing states it) and who joined (with a 2-line bio). Both come from the filing text, and each quote is verified.
  - Legal, M&A and equity-raise items. Repeated updates on the same matter collapse into one card.
- **Moves:** price ±X% or volume ×N against the 20-day average, set with one global threshold control (defaults 5% and 2×). Each move links to a same-day or previous-session filing, or shows **No filing found**.
- **Note** is a compact list. **Routine** is hidden behind a count.

**Research (pull)**
- **Promise tracker** for BEL, POLYCAB and PERSISTENT (precomputed). BEL replaced DIXON because Dixon guides mostly by segment; BEL gives company-wide yearly revenue-growth and EBITDA-margin targets, so FY26 resolves to real verdicts. It covers what management guided, the reported actual, and a Beat / Met / Missed / In progress verdict. Tap any item to see the exact transcript quote. Credibility is a simple count.
- **Live financial snapshot** for any NSE ticker typed in. It fetches screener.in at request time and computes headline numbers, margins and an 8-quarter trend. Renamed companies resolve through screener search (ZOMATO → ETERNAL).

**Added in the latest round (all code-only; zero new LLM calls)**
- Results cards link to the promise tracker: “Guided ≥28% FY27 EBITDA margin → delivered 27.9% this quarter”.
- Inbox zero: mark Act items done (saved on the device), undo, and a cleared state.
- Thesis editor: why/metric/operator/number per holding, saved on the device, re-checked instantly.
- Research extras: five-year trajectory, cash quality (OCF ÷ PAT), balance sheet (debt-to-equity, working-capital days).
- Pattern flags from filing history: rating vs last rating, 2+ senior exits in 90 days, promoter-pledge trend.
- Freshness: “as of” on every screen, a STALE tag after 24h, and a saved-copy fallback instead of errors.
- Start here: a 3-tap first-visit path.
- Ask the calls: retrieval over the transcripts (`scripts/transcripts.py` builds the page index). Answers are verbatim passages with call and page, or “Not found in the documents.” No model writes them.

## How it is built

```
scripts/fetch.py      yfinance EOD · announcements (NSE API → BSE API → NSE RSS + screener's BSE list) · screener tables → data/
scripts/brain.py      rules classifier (Act/Note/Routine) · results cards · thesis check · moves · management cards → data/brief.json
scripts/promises.py   transcripts → Gemini extracts quoted guidance → code verifies + scores → data/promises/<SYM>.json
app/ + components/    Next.js (App Router), static page built from data/*.json, plus /api/snapshot/[ticker] (live)
```

Where AI is used, and how code checks it:

| Step | Model | What code checks |
|---|---|---|
| Classify filings | none (ordered regex rules on BSE subcategory, title, company headline; PDF first page for generic "Reg 30" filings) | n/a |
| Management change | `gemini-3.5-flash-lite` (short filings) | Name and evidence quote must appear in the PDF text. Code decides joined/left from the verified quote's wording. Tenure and bio are kept only if verbatim. Bio is cut to 2 sentences. |
| Guidance extraction | best available flash model, falling back to lite (long transcripts) | Quote must be in the transcript. Every target number must appear in the quote. Units are converted by code. Code rejects targets for periods that had already ended at the time of the call, and treats qualified targets (e.g. "excluding Vivo") as not checkable. |
| Verdict | none | Fiscal-period → table-column mapping. Tolerances: ±0.2pp on margins, ±1pp on growth, ±2% on absolute amounts. |

Cost controls:
- Transcripts are cut down to guidance-bearing sentence windows, 55–77% fewer tokens, and quotes are still verified against the full text.
- Every LLM response is cached on disk.
- `FINN_LLM_BUDGET=N` hard-caps new (uncached) LLM calls per run.
- Gemini's free tier allows 20 requests per model per day, so the client falls back across models on overload or exhausted quota.

## Data sources (fetch check, 15 Nov 2026, from a cloud container)

| Source | Status |
|---|---|
| yfinance EOD | ✅ |
| NSE corporate-announcements API | ❌ Akamai 403 to datacenter IPs |
| BSE announcements API | ✅ (fallback, used) |
| NSE RSS / screener's BSE filing list | ✅ (second fallback) |
| screener.in tables + transcript links, BSE PDFs | ✅ |

## Run it

```bash
pip install -r requirements.txt
python scripts/fetch.py
GEMINI_API_KEY=... python scripts/brain.py      # --no-llm skips management cards
GEMINI_API_KEY=... python scripts/promises.py
npm install && npm run dev
```

The Gemini key is read only from the `GEMINI_API_KEY` environment variable.

See `PLAN.md` for the roadmap and what is in or out of scope.
