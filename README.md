# FINN

FINN is a mobile-first morning note for an Indian stock portfolio. It reads every exchange filing for your holdings, tells you the few that need you, and checks what management promised against what the company reported.

**Live:** https://finn-wine.vercel.app · **Write-up:** [WRITEUP.md](WRITEUP.md)

## What you can do with it

**Brief** (the daily note):
- **One headline.** It says how many items need you, for example "16 things need you this month". Mark each one done until the Brief is empty.
- **Act on.** Items are ordered by how serious they are:
  1. A broken thesis line, or a promise running behind.
  2. A large drop in profit or margin.
  3. A management change.
  4. Legal and other items.

  Good or in-line results move down to "Worth a look".
- **Off thesis.** Each holding has a one-line reason you own it and a number that must hold, for example "EBITDA margin at least 25%". (EBITDA is operating profit before interest, tax, depreciation and amortisation.) You can edit the lines. FINN re-checks them at once.
- **Patterns.** FINN flags repeated senior exits, a rating watch, and a rising promoter pledge. A promoter pledge is when the founding shareholders borrow against their shares.
- **Price moves.** Each large move or volume spike is linked to the filing that explains it, or flagged when there is none.
- **Sources.** Tap a figure in a table to open its source: the filing page, the transcript page, the screener.in table or the daily price history.

**Research** (look up any NSE-listed company):
- **A promise tracker.** It lists each target management gave on earnings calls, what was delivered, and a verdict: Beat, Met or Missed for finished targets, and On track or Off track for running ones. Each quote opens the call transcript at its page.
- **Any other company.** "Build tracker" reads its last four calls, and the result is saved for everyone. A build takes about 15 minutes, because the stronger model reads long transcripts slowly.
- **A live snapshot.** Latest quarter, five-year trend, cash quality and balance sheet. Cash quality is operating cash flow as a share of profit.
- **Bull vs bear.** Three points for and three against, built only from FINN's own numbers.
- **Ask the calls.** Ask a question and get management's own words, with the speaker and page. If only an analyst raised the topic, it says "Not found in management's remarks." If nobody did, it says "Not found in the documents."

## How it works

```
 Every weekday at 19:00 IST (GitHub Actions)              The website (Vercel)
 ┌──────────────────────────────────────────┐   data    ┌─────────────────────────────┐
 │ fetch   prices, filings, financial tables │ ───────▶  │ Brief and Research pages     │
 │ rules   sort filings into Act / Worth a   │           │ live company snapshot        │
 │         look / Routine                    │           │ ask the calls (no model)     │
 │ AI      copy names and figures, quoted    │           │ "Build tracker" button ──┐   │
 │ code    check quotes, compute, decide     │           └──────────────────────────┼───┘
 └──────────────────────────────────────────┘                                      ▼
                                              On demand: read 4 earnings calls, find guidance,
                                              check every quote, score it, save the tracker
```

## How models are used

FINN uses Google's Gemini models through their API. The costs below are at Google's paid rates. The free tier was enough for everything so far, so the actual spend is $0. Over the whole project, FINN made 131 model calls, which would cost about $0.99 at paid rates.

| Task | Model | Why | Cost per run |
|---|---|---|---|
| Sort filings into Act, Worth a look, Routine | None (fixed rules) | Cheap, repeatable, and every decision names its rule | $0 |
| Who joined or left, with a short bio | Gemini 3.5 Flash-Lite | A short filing; copying text is easy | about $0.002 per filing |
| Results figures from the results filing | Gemini 3.5 Flash-Lite | One or two pages of tables | about $0.002 per filing |
| Daily refresh, all of the above | Flash-Lite only, at most 12 new calls | A hard cap per run | $0 to $0.03 |
| Guidance from earnings calls (tracker builds) | Best available Gemini Flash first, then Flash-Lite | Long transcripts need a stronger model | about $0.12 per company (estimate) |
| Ask the calls, bull vs bear, verdicts | None (code) | Answers must be exact, not generated | $0 |

The Flash estimate uses a rate that is not on Google's pricing page.

## How grounding is enforced

- **The model only finds and quotes.** It returns the exact sentence or table row it relied on.
- **Code checks every quote.** The quote must appear word for word in the source document. The target number must appear inside the quote. Anything that fails is dropped.
- **Code finds the page.** FINN locates each quote in the page-by-page text of the PDF, so the link opens at that page.
- **Code computes every number.** Unit conversion, growth rates, margins, tenure ("since 1997" becomes "about 29 years") and how far a promise was missed are all computed in code.
- **Code decides every verdict.** Fixed tolerances decide each verdict: 0.2 points on margins, 1 point on growth and 2% on rupee amounts.
- **Results are cross-checked.** FINN compares figures from the results filing with screener.in. Of the 15 results filed in the last 30 days, 9 match and 1 differs and is flagged. The other 5 are scanned images, so FINN shows screener's figures and says so.

## Data sources and fallbacks

| Data | Source | If it fails |
|---|---|---|
| Filings | NSE announcements | NSE blocks cloud servers, so the BSE announcements feed is used in practice. Then the NSE RSS feed plus screener.in's filing list. |
| Prices | Yahoo Finance, end of day | The previous day's data is kept |
| Financial tables, transcript links | screener.in | The Research snapshot shows FINN's last saved copy, marked stale |
| Transcripts and filing PDFs | BSE | Unreadable PDFs are skipped and labelled |
| AI | Gemini, falling back across models | On quota (429) or missing model (404) errors, the daily refresh skips the AI steps and still saves prices and filings. Tracker builds show "Tracker builds are paused right now (AI quota)", and nothing half-built is saved. |

## How to run it

```bash
pip install -r requirements.txt
python scripts/fetch.py                              # prices, filings, tables
GEMINI_API_KEY=... python scripts/brain.py           # build the Brief
GEMINI_API_KEY=... python scripts/promises.py BEL    # build one promise tracker
npm install && npm run dev                           # the website
```

The Gemini key is read only from the `GEMINI_API_KEY` environment variable. The scheduled refresh also needs a Vercel token to redeploy the site, and the website needs a GitHub token to start tracker builds.

## Known limitations

- **The filing sorter is checked only lightly.** Its accuracy was 73% on a 60-filing check. I labelled that sample myself, so the figure is not independent.
- **Some promises aren't scored.** Promises about one business segment, or stated in US dollars, are shown but not scored.
- **No push notifications.** New items are marked only when you open the app.
- **Tenure is shown only when the filing states it.** There is no stored history of past appointments.
- **Some speakers are misattributed.** Ask the calls identifies speakers by pattern. One analyst on one call is still counted as management.
- **Bull vs bear thresholds are mine.** They are not calibrated.
- **Tracker builds are slow.** A build takes about 15 minutes, since the Flash model reads each long transcript slowly. With the lite model it took about one minute but found fewer promises.
- **Updates are slower than NSE.** Filings arrive through BSE, minutes later than on NSE, and the data refreshes once each weekday evening.
