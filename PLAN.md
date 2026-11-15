# FINN plan

> This file holds the latest round of roadmap changes as given. The base version they amend is not in this repo,
> so "everything else stays as in the last version" refers to that earlier document.

## Current build scope (what is being built now)

Only this is in scope right now. Anything not on this list gets asked about first.

Build order:

1. **Data.** A Python script fetches data for 10 portfolio stocks (mixed sectors and caps) and saves JSON in `/data`:
   - EOD price and volume from yfinance
   - recent announcements from NSE, with BSE as the fallback
   - quarterly tables from screener
2. **Brain (code first).**
   - Rules classify announcements into Act / Note / Routine.
   - Results-card numbers come from screener tables, with QoQ and YoY computed in code.
3. **Moves.**
   - Flag a price move of ±5% or volume above 2× the 20-day average.
   - Link it to a filing from the same day or the previous day, otherwise show "No filing found".
4. **Promise tracker** for 2–3 tickers, precomputed:
   - Gemini extracts guidance from recent concall transcripts, with an exact quote.
   - Code checks that the quote exists in the text and maps it to a table metric.
   - Code decides Beat / Met / Missed / In progress.
   - Credibility is a simple count.
5. **Frontend.** Next.js, mobile-first, two tabs:
   - **Brief:** header "As of [time], X filings checked, Y need your attention", tiered cards, threshold control.
   - **Research:** promise tracker with tap-to-quote, plus a live financial snapshot for any ticker typed in.
6. **Deploy** on Vercel.

Also in scope:

- BSE is the fallback for NSE.
- **Management change card:** who left and who joined, taken from the filing text, plus a 2-line bio of the person who joined.
- **Thesis line:** pre-filled per stock (why I own it + one metric, e.g. EBITDA margin ≥ 18%). Code checks it against the results and flags a breach at the top of the Brief.
- The Gemini key is read from the env var `GEMINI_API_KEY` and never hardcoded.

Principle: **AI only finds and quotes. Code checks every quote, computes every number and decides every verdict.**

### Phase 1a fetch check, run from the cloud build container (15 Nov 2026)

| Source | Result | Path used |
|---|---|---|
| yfinance EOD | ✅ works | primary |
| NSE corporate-announcements API | ❌ blocked (Akamai 403 to datacenter IP, even from headless Chromium) | tried first, falls through |
| BSE announcements API | ❌ blocked (Akamai 403) | tried second, falls through |
| NSE public RSS (`nsearchives.nseindia.com`) | ✅ works, but only the latest ~130 filings across the exchange | used (NSE-sourced) |
| screener.in company page: 5 latest BSE filings (title, time, BSE PDF link) | ✅ works | fallback. Screener's AI one-liners are ignored |
| BSE PDF attachments (filings, concall transcripts) | ✅ works | used for filing text and transcripts |
| screener.in quarterly / annual tables | ✅ works | primary |
| Gemini (OpenAI-compatible endpoint) | ✅ works | promise extraction, management-change extraction |

Decision (user, 15 Nov): NSE RSS → screener's BSE filing list as fallback. Filing history builds up as the fetch runs each day.
The NSE and BSE APIs stay in the script as tries 1 and 2, so they are used wherever they are reachable (e.g. a residential IP).

---

## Roadmap changes for this round

Only the changed parts are below. Everything else stays as in the last version.

### 1. Must-ship slice (🔒)

- **Brief and results card:** stays in the slice as before.
- **Minimal management change card:**
  - Who left, with their tenure if the filing states it.
  - Who joined, with a 2-line bio. The brief names this as one of its two favourite examples, so it ships.
  - The stored-history lookup for tenure is an upgrade, not part of the slice.
- **Minimal Moves:**
  - One global threshold control for price ±X% and volume ×N (defaults 5% and 2×). This covers the brief's "make the threshold configurable."
  - The explained/unexplained link to filings.
  - Per-stock thresholds are an upgrade, not part of the slice.
- **Promise Tracker:** stays in the slice as before.
- **Live unseen ticker:** now runs as a background job (see 3 below).

### 2. Cut order if time runs out

Pattern flags → ask bar → "Start here" → Research extras → per-stock thresholds and stored-tenure lookup → thesis line.

Nothing in the 🔒 slice is ever cut.

### 3. How an unseen ticker runs (background job with polling)

1. **Tap:** the UI calls `POST /api/research/:ticker`.
   - If a cached result exists, it comes back instantly.
   - Otherwise the call creates a job ID and starts the runner.
2. **Runner:** a GitHub Actions `workflow_dispatch`. It is free and long-running, so the Vercel time limit stops mattering.
3. **Progress:** the runner writes each step to a free key-value store (Upstash or Supabase), e.g. `docs ✓ → transcripts 2/4 → verifying quotes → scoring`.
4. **Polling:** the UI calls `/api/job/:id` every 2 seconds.
   - It shows each step as it happens.
   - It renders partial results as they land: the Snapshot and Trajectory appear first because they're pure code and fast, then the Promise Tracker.
5. **Demo tickers** are run ahead of time so they open instantly. Only a truly unseen ticker waits, with roughly 1–3 minutes of visible progress.

### 4. Phase 1a: fetch check and fallbacks

| Source | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| NSE announcements | GitHub Actions | BSE API from Actions | Scheduled fetch on your Mac, pushed to the repo |
| EOD prices | yfinance from Actions | Mac fetch | n/a |
| **Screener (unseen tickers)** | From the Actions runner | **BSE filings:** listed companies have to upload concall transcripts and annual reports to the exchange, and quarterly tables come from BSE results data | Mac worker. It only runs while the Mac is on, so this is **for development only** and not something to demo |

Because unseen tickers now run on GitHub Actions, the check that matters is **screener from Actions**, not screener from Vercel. 1a tests both, plus the BSE transcript path, before anything is built on top of them.

**Exit:** every source has a confirmed path that works, including a live unseen ticker running end-to-end on its primary path or on fallback 1.

### 5. Roadmap

| # | Phase | Done when |
|---|---|---|
| 1a | Fetch check (table above) | Every source has a confirmed working path |
| 0 | Setup: tickers, schema, FY-to-column map, default thesis lines | Schema is frozen |
| 1b | Data plumbing and last-updated timestamps | 30+ days of data stored |
| 2 | Classifier, tiers and Act ordering | At least 90% accuracy on 100 hand-labelled filings |
| 3 🔒 | Promise engine | Correct on 4 research tickers |
| 4 🔒 | Results card, minimal management change card, minimal Moves | Correct on 5 results filings, 2 management changes and 3 past price/volume spikes |
| 5 🔒 | Job runner, job-status store and polling UI | An unseen ticker completes with live progress |
| 6 🔒 | Brief UI and Research UI, deployed and tested live on an unseen ticker | **Checkpoint: must-ship slice is live** |
| 7 | Thesis editor and check, localStorage state | A breach shows up at the top of the Brief |
| 8 | Upgrades: stored-tenure lookup, per-stock thresholds | Correct when replayed on past events |
| 9 | Research extras, pattern flags, ask bar, "Start here" | Ask bar refuses correctly on 5 questions the documents can't answer |
| 10 | Test on 5 random tickers, hand-check verdicts, cost table | "What broke" report written |
| 11 | Ship: README, architecture diagram, build history, writeup | Live link works on a phone |
