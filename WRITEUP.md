# FINN: write-up

**Live:** https://finn-wine.vercel.app · **Repo:** this one · **Details:** [README.md](README.md)

## What I built

FINN is a mobile-first morning note for an 18-stock Indian portfolio. The portfolio covers a PSU, two pharma companies, a bank, an NBFC and three small caps.

**The Brief** reads every exchange filing, keeps the few that need you, and says why in one plain sentence. With today's data it is 20 of 231 filings over 30 days.
- Results come with their numbers computed, plus what management had promised.
- Management changes say who left and who joined, with a verified bio.
- Price and volume moves are tied to the filing that explains them, or flagged when none does.
- Your own thesis line for each holding is checked against every quarter.

**Research** answers "can I trust this management?":
- A **promise tracker** scores guidance against reported numbers. BEL beat both FY26 targets but is running below its FY27 margin promise. PG Electroplast missed its FY26 sales guide by 7%. Persistent promised +100 bps of margin and is tracking −450.
- It also gives a live financial snapshot for any NSE ticker, filing patterns, and an "ask the calls" box that only ever answers with a verbatim quote.

## The interaction point of view

**A finite morning note, not a feed and not a chatbot.**

An investor's scarce resource is attention, so the product's job is to *end*:
- **The header ends somewhere:** it is one sentence with a number ("20 things need you this month"). Every Act item can be marked done, and the Brief reaches **inbox zero**.
- **Nothing is endless:** routine paperwork is set aside behind a count rather than scrolled past.
- **Verdict first, method hidden:** every item opens on a plain-English line, and the evidence (rules, verified quotes, tolerances) sits one tap away under "How FINN checked this".
- **No chat:** there's no chatbot because a chatbot invites the model to talk. The ask box returns the company's own words with a page number, or says "Not found in the documents."
- **The look:** a broker's note, with serif leads, tabular numbers, hairline rules, and one accent colour reserved for breaches and misses.

## Key decisions

- **AI quotes, code decides.**
  - Gemini is used for two narrow jobs: copying who joined or left from a filing, and copying guidance sentences from transcripts.
  - Code checks that every quote exists in the source and that every target number is inside its quote.
  - Code converts units, maps fiscal periods onto table columns, computes every number and picks every verdict.
  - The plain-English lines are fixed templates filled by code; no model writes copy.
- **Rules before models.** Filing classification is ordered regex rules over BSE's subcategory, the title, the company's own headline, and, for generic "Reg 30" filings, the PDF's first page. It is cheap, deterministic and debuggable: every Act item says which rule fired.
- **Blocked sources and fallbacks.**
  - NSE's announcement API returns 403 to cloud IPs, both from the build sandbox and from GitHub's runner.
  - BSE's API works and is the primary path in practice.
  - NSE RSS plus screener's BSE filing list is the second fallback; it was exercised for real when BSE returned HTTP 400 for BEL on the runner.
  - Company-site transcripts are blocked, so FINN uses the copies filed on BSE.
- **The quote checker is the product's spine.**
  - **Exact first:** a quote must appear verbatim after typography normalisation.
  - **Whitespace-free second pass:** PDF extraction splits words and drops hyphens ("cro res", "2,200-plus"), so a second pass ignores spaces and hyphens while every letter and digit must still match in order. That one change took rejected real quotes from 28 to 4.
  - **Numbers as written:** the target number must appear inside the quote. This caught the model quietly converting "₹60 billion" into "6,000 crore".
- **Tolerances are explicit.** ±0.2pp on margins (they're reported to 0.1pp), ±1pp on growth, ±2% on rupee amounts. "Around 15%" against 16.2% is a Beat under these rules. The hand-check flags it as borderline, and it is the kind of call a reader should be able to see, so it is.
- **BEL was chosen by text search before any model calls.** When I needed a company with company-wide yearly targets, I regex-scanned the transcripts of three candidates (BEL, PG Electroplast, Kaynes) for guidance-plus-number sentences, and confirmed that management (not analysts) stated them. Only then did I spend calls. Gemini's free tier allows 20 requests per model per day, so every call was budgeted.
- **Thresholds were set before seeing the data.** The thesis lines for all 18 holdings, the Act rules and the "results that matter" bar (profit down or up 25%+, revenue down, margin moving 2pp+, thesis breach, promise off track) were written down before looking at the quarter's numbers. That way the breaches (HDFC Bank, Asian Paints, Maruti, Trent, Safari, Gravita) are findings, not tuning.
- **Cost.** 116 model calls in total (634k input and 70k output tokens), about $0.95 at paid-tier rates and **$0 actually spent**. The levers that kept it there:
  - Transcripts are chunked to guidance-bearing sentence windows (55–77% fewer tokens).
  - Answers are cached per filing or transcript URL.
  - A hard per-run budget, and lite-only scheduled runs.

## What I left out, deliberately

- **NSE as the live source.** It's blocked from every cloud IP I tried; a residential relay would fix it, but it's infrastructure, not product.
- **LinkedIn-style bios.** Bios come only from the filing, so they can be verified.
- **Push notifications, accounts, intraday data.** The note is read once a day; per-device storage covers done items, thesis lines, alert types and thresholds.
- **Segment-level and USD promises.** They're shown as "can't be checked against reported totals" rather than scored against the wrong number.
- **Bull/bear cases and model-written summaries.** They would be the first place AI slop gets in.

## What broke

**Data and infrastructure**
- NSE's API returned 403 from both cloud environments. BSE once returned HTTP 400 for BEL on the runner, and the fallback worked.
- Screener mislabels some transcript dates (a "Jul 2026" TCS transcript was the July 2025 call), so FINN reads the quarter from the transcript's own text.
- The first scheduled dry run spent 12 lite calls instead of zero. The runner installed pypdf 7.1 (mine was 6.17), so extracted text and prompt hashes changed. Fixed by pinning versions and keying the cache by filing URL; the second run made 0 calls.

**Models**
- `gemini-2.5-flash` is retired for new keys.
- `gemini-3.8-flash` hit a 30-second proxy idle limit; fixed by streaming.
- Flash models returned 503 under load, and the 20-requests-per-day free tier ran out mid-run. A model fallback chain fixed both, but 6 of BEL's 7 transcripts were read by the lite model, which finds fewer promises (code checks keep precision).

**Classifier** (most found by reviewing every Act item, then by a 60-filing spot check: 73% tier agreement before fixes)
- Maruti filing its parent Suzuki's results was treated as Maruti's results.
- US FDA *approvals* were tagged Act.
- Reliance's "(Post-IPO)" AGM papers were treated as an IPO.
- Intra-group investments and subsidiary mergers were treated as deals.
- A regex couldn't match across a PDF line break.
- BEL's "Executive Director (function)", a PSU grade below the board, was treated as a board seat.
- The pledge form prints "creation / release / invocation" as a header, so a naive count reported six invocations instead of nine new pledges.

**Promise tracker**
- Analyst questions were extracted as guidance.
- Qualified targets ("excluding Vivo") were compared with totals.
- Targets stated as "better than industry" have no number to check.
- All three are now rejected or marked not checkable.

**Five random tickers** (DMART, ADANIPORTS, ITC, NAUKRI, PAGEIND)
- Snapshots and extras worked for all five, in under 2 seconds.
- The ask box was **dead for all five**: its transcript index only covers the 18 holdings.
- The on-demand tracker needs a GitHub token on Vercel that isn't set yet.
- **Info Edge (NAUKRI)'s "cash lags profit: 24%" is misleading.** Its profit is dominated by gains on investment stakes, and its working-capital days are distorted by advance billing. OCF ÷ PAT needs an "other income" adjustment.

**UX**
- A first load once showed "Nothing needs you today, from 0 filings" (24h). I couldn't reproduce it in fresh contexts, so the default window is now computed on the server, and pages restored from the back/forward cache reset to it.
- The Research header's labels could overlap the ticker lists on narrow phones; they now stack.

## What's next

- **Ask any ticker:** fetch and index transcripts on demand, the same way the snapshot works live.
- **Score segment and USD promises** against segment tables and investor presentations.
- **Calibrate the tolerances** with a second human annotator, and grow the classifier eval beyond one labeller.
- **Morning push:** a web-push notification of the one-line header, once a day, nothing else.
- **NSE through a residential relay**, so filings land minutes earlier than on BSE.
- **Cash quality net of other income**, and sector-aware ratios for lenders and holding companies.
