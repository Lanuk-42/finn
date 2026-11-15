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
  - **Checked against the filing itself:** for results filed in the last 30 days, the lite model copies Revenue, PBT, PAT (and the inputs to EBITDA) from the results PDF with the exact row text. Code verifies each quote, converts lakh/million/crore, picks the current-quarter column, and cross-checks against screener's table. Each card then says one of three things:
    - *"✓ Verified against the filing"*;
    - *"⚑ The filing differs: PAT ₹25,548 Cr in the filing vs ₹29,550 Cr shown"*, with screener's figure kept and flagged;
    - *"Screener's figures: the filing is a scanned image FINN couldn't read reliably"*.
  - **Management cards** show who left (with tenure) and who joined (with a 2-line bio), taken from the filing and verified word for word. A **"Search on LinkedIn ↗"** link sits next to each incoming person's bio. It is a people-search URL built from the name and company; FINN shows no LinkedIn content.
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
  - **Guards** (the button is public): invalid symbols are rejected instantly, unknown companies after a screener lookup; a ticker already building reuses that build; at most 30 builds per IST day, with a clear message when the cap is hit.
- **Live snapshot for any NSE ticker:** headline numbers, ratios, an 8-quarter trend, a five-year trajectory, cash quality (OCF ÷ PAT) and the balance sheet (debt-to-equity, working-capital days). If screener.in is down, a saved copy is shown, tagged STALE.
  - **Investment-heavy companies** (other income ≥30% of pre-tax profit): cash is compared with *operating* profit, and the line says so.
  - **Distorted working-capital days** (far above the trade cycle): FINN uses the trade cycle and marks the headline figure n/m.
- **Bull vs bear:** three points a side, written by fixed code templates from numbers FINN has already computed. No model writes them.
  - **Inputs:** latest-quarter growth and margin; five-year CAGRs and margin drift; cash conversion; debt and working capital; ROCE; promise verdicts; flagged filing patterns; and your thesis line (edits saved on the device count).
  - **Selection:** each candidate has a fixed threshold and score, and the strongest three per side are shown.
  - **Sources:** each point names its source section, and tapping it scrolls to the number.
  - **Unseen tickers** get whatever the live snapshot supports (e.g. ITC: ROCE 38.9% and debt-free vs profit −19% YoY and margin −6.4pp). A side with nothing over the bar says so.
- **Filing patterns** for the company.
- **Ask the calls:** answers are verbatim transcript passages with the speaker, call and page. This is code-only retrieval, and no model writes the answer. It works for any ticker: holdings use a prebuilt index, and other tickers' two latest transcripts are fetched and read on first use (a few seconds), then cached.
  - **Management only.** Each call is split into speaker turns. The moderator's hand-offs (*"the next question is from Kunal Shah of Citi"*) and the company's own titled list of participants decide who is an analyst. Analysts' turns are never returned.
  - **Refusals:** if only an analyst's question matches, the answer is *"Not found in management's remarks."*; if nothing matches, *"Not found in the documents."*
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
| Results vs filing | `gemini-3.5-flash-lite` copies figures and their row text from the results PDF | Each quote is in the PDF text; the figure is inside its row (or on the page, for PDFs that extract column by column); code reads the unit header, takes the current-quarter column itself, converts to crore, and compares with screener (±1%). A gap over 25% is treated as a misread scan, not a restatement |
| Management change | `gemini-3.5-flash-lite` copies names and sentences | Name and evidence must appear in the filing. Code decides joined/left from the verified wording. Tenure and bio are kept only if verbatim. |
| Guidance | best available flash model, falling back to lite (daily and on-demand runs: lite only) | Quote is in the transcript; the target number is inside the quote; analyst questions are rejected; code converts units, maps the fiscal period to table columns, and applies tolerances (±0.2pp margins, ±1pp growth, ±2% amounts) |
| Bull vs bear | code only (templates over computed numbers) | n/a |
| Ask the calls | code only (retrieval) | The passage must appear exactly on its page, inside one management speaker's turn |

Cost controls:
- Transcripts are cut to guidance-bearing sentence windows before any model sees them (55–77% fewer tokens), and quotes are still verified against the full text.
- Every LLM answer is cached by filing or transcript URL plus prompt version.
- `FINN_LLM_BUDGET` hard-caps new calls (`0` = cache only), and `FINN_LITE_ONLY=1` restricts calls to lite models.
- Gemini's free tier allows 20 requests per model per day, so the client falls back across models.

Totals so far: **131 calls, 692k input and 76k output tokens: about $0.99 at paid-tier rates (estimated; see the 3.5 Flash row), actual cost $0** ([eval/cost.json](eval/cost.json)). Rates for 3.5 Flash-Lite and 3 Flash Preview are from Google's Gemini API pricing page.

| Model | Calls | Input tokens | Output tokens | At paid-tier rates |
|---|---|---|---|---|
| gemini-3.5-flash-lite | 102 | 326,201 | 47,187 | $0.22 |
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
- **Results vs filing** (the 15 results cards filed in the last 30 days, 15 lite calls):
  - 9 matched.
  - 1 mismatch: Reliance PAT, ₹25,548 Cr in the filing vs ₹29,550 Cr on screener. It is flagged, not explained.
  - 5 fell back to screener: Campus, Sun Pharma, Deepak Nitrite, Maruti and JK Cement are scanned PDFs whose text layer misreads digits.
  - 25 older cards are labelled "not checked against the filing".
- **Ask the calls, management only:** 18 questions over 15 holdings and 2 unseen tickers.
  - Before: 2 answers were an analyst's words (BEL order inflow, Info Edge billings).
  - After: 0. Analyst-only questions (e.g. "congratulations numbers") return "Not found in management's remarks."
  - Speaker roles were checked by eye on 15 bundled and 8 live calls; misses are listed in [WRITEUP.md](WRITEUP.md#known-limitations--next).
- **Five random NSE tickers** (DMART, ADANIPORTS, ITC, NAUKRI, PAGEIND): see [eval/random_tickers.json](eval/random_tickers.json) and [WRITEUP.md](WRITEUP.md#what-broke).
- **Private-window first load:** `node tests/first-load.js [url]`.

## Known limitations

See [WRITEUP.md](WRITEUP.md#known-limitations--next). In short:
- The classifier was 73% in agreement on a self-labelled spot check.
- Segment and USD promises aren't scored.
- There are no real push notifications.
- Departing executives' tenure comes only from the filing, because no stored tenure lookup is built.

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
