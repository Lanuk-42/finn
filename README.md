# FINN

A mobile-first morning note for an Indian equity portfolio. It tells you the few things that need you, and it checks management's promises against the reported numbers.

**Live:** https://finn-wine.vercel.app · **Write-up:** [WRITEUP.md](WRITEUP.md) · **Plan:** [PLAN.md](PLAN.md)

> **The AI only finds and quotes. Code checks every quote, computes every number and decides every verdict.**

## What it does

**Brief (push)**: a finite note, not a feed.
- **Header:** one sentence, e.g. *"20 things need you this month"*, with *"from 231 filings across 18 holdings · as of …"* underneath. The window is 24h / 3d / 7d / 30d, and it opens on the shortest window with at least 3 items to act on (computed on the server).
- **Off thesis:** each holding has a "why I own it" line and a metric rule. Breaches are listed first. The thesis editor (saved on the device) re-checks instantly.
- **Patterns:** from 180 days of filings:
  - a rating versus the previous rating;
  - 2+ senior exits within 90 days;
  - the promoter-pledge trend.
- **Act on:** results, management changes, legal matters, deals and equity raises.
  - Every item opens on one plain-English line built by code from computed numbers.
  - **Results cards** show revenue, EBITDA, PBT and PAT with QoQ and YoY, plus a promise line: *"Guided ≥28% FY27 EBITDA margin → delivered 27.9%"*. A result stays here only if something moved; in-line quarters go to "Worth a look".
  - **Management cards** show who left (with tenure) and who joined (with a 2-line bio), taken from the filing and verified word for word.
  - **Your controls:** mark items done (inbox zero), and choose which filing types count as alerts.
- **New since your last visit:** returning visits mark new filings and moves with "● new", and the header says how many.
- **Moves:** price ±X% or volume N× the 20-day average, with a global control and per-stock overrides. Each move is linked to a same-day or previous-session filing, or flagged "no filing to explain it".
- **Worth a look**, then routine filings set aside behind a count.
- **Method:** everything about how FINN checked something sits behind "How FINN checked this".

**Research (pull)**
- **Code decides:** Research opens on the clearest verdict across all trackers. Today that is *"PG Electroplast guided ₹5,700–5,800 Cr of FY26 sales. It delivered ₹5,288 Cr, 7.2% short."*, with the quote one tap away.
- **Promise tracker:** a big *kept / checked* count, one line, then rows of promise → actual → verdict (Beat / Met / Missed / On track / Off track / Holding / Slipping). Tap a row for the exact quote and its page.
  - **Precomputed:** BEL, Polycab, Persistent.
  - **Built on demand:** PG Electroplast and Kaynes.
  - **Any other ticker:** "Build tracker" runs on GitHub Actions with live progress (about a minute) and saves the result for everyone. Built on demand so far: PG Electroplast, Kaynes, Havells, Amber, KEI.
  - **Guards** (the button is public): invalid symbols are rejected instantly, unknown companies after a screener lookup; a ticker already building reuses that build; at most 10 builds per IST day, with a clear message when the cap is hit.
- **Live snapshot for any NSE ticker:** headline numbers, ratios, an 8-quarter trend, a five-year trajectory, cash quality (OCF ÷ PAT) and the balance sheet (debt-to-equity, working-capital days). If screener.in is down, a saved copy is shown, tagged STALE.
  - **Investment-heavy companies** (other income ≥30% of pre-tax profit): cash is compared with *operating* profit, and the line says so.
  - **Distorted working-capital days** (far above the trade cycle): FINN uses the trade cycle and marks the headline figure n/m.
- **Filing patterns** for the company.
- **Ask the calls:** answers are verbatim transcript passages with the call and page, or *"Not found in the documents."* This is code-only retrieval, and no model writes the answer. It works for any ticker: holdings use a prebuilt index, and other tickers' two latest transcripts are fetched and read on first use (a few seconds), then cached.
- **Start here:** a 3-tap first visit (Brief → a results card → its promise tracker → try any ticker).

## How it is built

```
            GitHub Actions (daily 19:00 IST)                          Vercel (Next.js)
┌───────────────────────────────────────────────────┐    ┌─────────────────────────────────────┐
│ check_sources.py  NSE API · NSE RSS · BSE · Yahoo  │    │ /            static Brief + Research │
│ fetch.py   prices (yfinance)                       │    │              built from data/*.json  │
│            filings: NSE API → BSE API → RSS+screener│──▶ │ /api/snapshot  live screener → code │
│            tables + concall links (screener.in)     │data│                (saved copy if down)  │
│ brain.py   rules: Act / Note / Routine              │ /  │ /api/ask       transcript retrieval │
│            results cards, thesis, moves, patterns   │    │ /api/promise   ready | build | poll  │
│            lite LLM: who joined/left (quoted) ──┐   │    └──────────────┬──────────────────────┘
│ promises.py  LLM finds guidance (quoted) ──┐    │   │                   │ workflow_dispatch
│              code verifies, maps, scores    │    │   │    ┌──────────────▼──────────────────────┐
└─────────────────────────────────────────────┼────┼───┘    │ promise.yml: fetch → transcripts →   │
                                              ▼    ▼        │ extract + check → commit tracker     │
                                  quote checker (verify.py)  └─────────────────────────────────────┘
```

| Step | Who decides | What code checks |
|---|---|---|
| Classify filings | ordered regex rules on BSE subcategory, title, company headline; PDF first page for generic "Reg 30" filings | n/a |
| Results card, thesis, moves, patterns | code only | n/a |
| Management change | `gemini-3.5-flash-lite` copies names and sentences | Name and evidence must appear in the filing. Code decides joined/left from the verified wording. Tenure and bio are kept only if verbatim. |
| Guidance | best available flash model, falling back to lite (daily and on-demand runs: lite only) | Quote is in the transcript; the target number is inside the quote; analyst questions are rejected; code converts units, maps the fiscal period to table columns, and applies tolerances (±0.2pp margins, ±1pp growth, ±2% amounts) |
| Ask the calls | code only (retrieval) | The passage must appear exactly on its page |

Cost controls:
- Transcripts are cut to guidance-bearing sentence windows before any model sees them (55–77% fewer tokens), and quotes are still verified against the full text.
- Every LLM answer is cached by filing or transcript URL plus prompt version.
- `FINN_LLM_BUDGET` hard-caps new calls (`0` = cache only), and `FINN_LITE_ONLY=1` restricts calls to lite models.
- Gemini's free tier allows 20 requests per model per day, so the client falls back across models.

Totals so far: **116 calls, 634k input and 70k output tokens: about $0.95 at paid-tier rates (estimated; see the 3.5 Flash row), actual cost $0** ([eval/cost.json](eval/cost.json)). Rates for 3.5 Flash-Lite and 3 Flash Preview are from Google's Gemini API pricing page.

| Model | Calls | Input tokens | Output tokens | At paid-tier rates |
|---|---|---|---|---|
| gemini-3.5-flash-lite | 87 | 268,297 | 41,467 | $0.18 |
| gemini-3.5-flash | 27 | 353,499 | 24,721 | ~$0.75 (estimate: this model's rate isn't on the official pricing page I could retrieve) |
| gemini-3-flash-preview | 2 | 12,288 | 3,734 | $0.02 |

## Data sources

| Source | From this build's cloud sandbox | From GitHub's runner |
|---|---|---|
| NSE corporate-announcements API | ❌ 403 | ❌ 403 |
| BSE announcements API (fallback, used) | ✅ | ✅ (one HTTP 400 for BEL, which fell back) |
| NSE RSS + screener's BSE filing list (second fallback) | ✅ | ✅ |
| Yahoo Finance EOD, screener.in, BSE PDFs | ✅ | ✅ |

## Evaluation

- **Classifier spot check:** 60 stratified filings **labelled by Claude, the coding assistant that built FINN, not by an independent annotator**.
  - Tier agreement **44/60 (73%) before fixes**. Act precision 8/11, Act recall 8/12; category agreement 58/60.
  - After fixing the rule bugs it exposed: 50/60. That figure is optimistic, because the same sample was used.
  - Full list in [eval/classifier_spotcheck.json](eval/classifier_spotcheck.json); misses discussed in [WRITEUP.md](WRITEUP.md#what-broke).
- **Promise verdicts checked by hand:** 3 verdicts against the transcript PDF page and the annual table, all correct and one borderline. See [eval/promise_handcheck.md](eval/promise_handcheck.md).
- **Five random NSE tickers** (DMART, ADANIPORTS, ITC, NAUKRI, PAGEIND): see [eval/random_tickers.json](eval/random_tickers.json) and [WRITEUP.md](WRITEUP.md#what-broke).
- **Private-window first load:** `node tests/first-load.js [url]`.

## Run it

```bash
pip install -r requirements.txt
python scripts/check_sources.py          # which sources are reachable from here
python scripts/fetch.py                  # prices, filings, tables  (--screener-only to refresh tables)
GEMINI_API_KEY=... python scripts/brain.py          # FINN_LLM_BUDGET=0 for cache-only
GEMINI_API_KEY=... python scripts/promises.py       # precomputed trackers
python scripts/transcripts.py            # page index for "Ask the calls"
npm install && npm run dev
```

The Gemini key is read only from `GEMINI_API_KEY`.

## Setup for the scheduled refresh and on-demand trackers

| Where | Name | Why |
|---|---|---|
| GitHub Actions secret | `GEMINI_API_KEY` | lite-model calls for new management changes and on-demand trackers; the daily source check confirms the key is valid |
| GitHub Actions secret | `VERCEL_TOKEN` | lets the daily job redeploy after committing fresh data |
| GitHub Actions variables | `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | which Vercel project to redeploy |
| Vercel env var | `FINN_GH_TOKEN` | fine-grained GitHub token (this repo; Actions: write, Contents: read) so the app can start and poll on-demand tracker builds |

All four are set. The daily job commits `data/` and redeploys the site itself; the first real run did both (15 Nov). Without them the site still works: the job commits but doesn't redeploy, and the "Build tracker" button doesn't appear.

## Repo map

```
scripts/   fetch.py · brain.py · promises.py · promise_job.py · transcripts.py · check_sources.py
scripts/finn/   classify.py (rules) · verify.py (quote checker) · results.py · management.py · promises.py
                patterns.py · screener.py · pdf.py · gemini.py (routing, budget, cache)
app/ components/ lib/   Next.js app; lib/lead.ts holds every plain-English template
data/      brief.json · promises/ · screener/ · prices/ · transcripts/ · cache/llm (committed LLM answers)
eval/      classifier spot check · promise hand-checks · random tickers · cost
.github/workflows/   daily.yml · promise.yml
```
