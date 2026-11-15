# FINN: write-up

**Live:** https://finn-wine.vercel.app · **Repo:** this one · **Details:** [README.md](README.md)

## What I built

FINN is a mobile-first morning note for an 18-stock Indian portfolio. The portfolio covers a PSU, two pharma companies, a bank, an NBFC and three small caps.

**The Brief** reads every exchange filing, keeps the few that need you, and says why in one plain sentence. With today's data it is 20 of 231 filings over 30 days.
- Results come with their numbers computed, plus what management had promised. Recent results are also checked against the results PDF itself: 9 of 15 match, 1 differs and is flagged, and 5 scanned filings fall back to screener's figures, labelled.
- Management changes say who left and who joined, with a verified bio and a LinkedIn people-search link.
- Price and volume moves are tied to the filing that explains them, or flagged when none does.
- Your own thesis line for each holding is checked against every quarter.

**Research** answers "can I trust this management?":
- A **promise tracker** scores guidance against reported numbers. BEL beat both FY26 targets but is running below its FY27 margin promise. PG Electroplast missed its FY26 sales guide by 7%. Persistent promised +100 bps of margin and is tracking −450.
- It also gives:
  - a live financial snapshot for any NSE ticker;
  - a **bull vs bear** of three points a side, built from code templates over FINN's own numbers, each linked to its source;
  - filing patterns;
  - an "ask the calls" box that only ever answers with a verbatim quote from **management**, never from an analyst.

## The interaction point of view

**A finite morning note, not a feed and not a chatbot.**

An investor's scarce resource is attention, so the product's job is to *end*:
- **The header ends somewhere:** it is one sentence with a number ("20 things need you this month"). Every Act item can be marked done, and the Brief reaches **inbox zero**.
- **Nothing is endless:** routine paperwork is set aside behind a count rather than scrolled past.
- **Verdict first, method hidden:** every item opens on a plain-English line, and the evidence (rules, verified quotes, tolerances) sits one tap away under "How FINN checked this".
- **No chat:** there's no chatbot because a chatbot invites the model to talk. The ask box returns management's own words with the speaker and page. Otherwise it says "Not found in management's remarks." (only an analyst raised it) or "Not found in the documents."
- **The look:** a broker's note, with serif leads, tabular numbers, hairline rules, and one accent colour reserved for breaches and misses.

## Key decisions

- **AI quotes, code decides.**
  - Gemini is used for two narrow jobs: copying who joined or left from a filing, and copying guidance sentences from transcripts.
  - Code checks that every quote exists in the source and that every target number is inside its quote.
  - Code converts units, maps fiscal periods onto table columns, computes every number and picks every verdict.
  - The plain-English lines are fixed templates filled by code; no model writes copy. Bull vs bear is the same: fixed thresholds pick candidate facts, scores rank them, and each point points at the number it rests on.
  - The results-vs-filing check applies the same split. The lite model copies printed figures and their row text. Code verifies the row, reads the unit, picks the current-quarter column itself, converts and compares.
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
- **Cost.** 131 model calls in total (692k input and 76k output tokens), about $0.99 at paid-tier rates (an estimate, because one model's rate isn't on Google's official page) and **$0 actually spent**. The levers that kept it there:
  - Transcripts are chunked to guidance-bearing sentence windows (55–77% fewer tokens).
  - Answers are cached per filing or transcript URL.
  - A hard per-run budget, and lite-only scheduled runs.

## What I left out, deliberately

- **NSE as the live source.** It's blocked from every cloud IP I tried; a residential relay would fix it, but it's infrastructure, not product.
- **LinkedIn content.** Bios come only from the filing, so they can be verified. The LinkedIn link is a plain people search on name + company; FINN fetches and shows nothing from LinkedIn.
- **Accounts and intraday data.** The note is read once a day; per-device storage covers done items, thesis lines, alert types and thresholds.
- **Model-written summaries.** They would be the first place AI slop gets in. Bull vs bear exists only because it can be done without one.

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
- **Ask box:** it was **dead for all five**, because its transcript index only covered the 18 holdings. *Fixed:* it now reads an unseen ticker's two latest transcripts on first use, and 4 of 5 answer in 3–7 seconds.
  - ITC is still refused correctly: no transcripts are listed for it.
  - Retrieval can still surface an analyst's question when no management sentence matches better (Info Edge's "billings growth").
- **On-demand tracker:** it needed a GitHub token on Vercel. *Fixed:* the token is set, and a live build for Havells went from button to tracker in about a minute.
  - Havells gives no numeric guidance, so its tracker correctly scores nothing.
  - The first reuse test started a duplicate build, because GitHub lists a new run only after a few seconds; fixed and re-tested.
- **Info Edge (NAUKRI):** "cash lags profit: 24%" was misleading, because its profit is dominated by gains on investment stakes and its working-capital days include cash. *Fixed:* cash quality now uses operating profit when other income is 30%+ of pre-tax profit, and working-capital days that include cash are marked n/m in favour of the trade cycle.
- **First real daily run:** fetch and brain succeeded, but the commit step failed, because excluding an ignored path makes `git add` exit with an error. Fixed; the next run committed data and redeployed the site.

**Results vs filing** (15 PDFs, 15 lite calls)
- **Column-by-column extraction:** some PDFs (BEL, Dixon) extract column by column, so a row's label and its figure aren't on the same line. Code accepts a figure whose label and number are both verified on the same page.
- **Wrong column:** the model sometimes copied the previous quarter's column (HDFC Bank). Code now takes the first 3+-digit figure in the verified row, because Indian results tables print the current quarter first.
- **Scanned PDFs:** they read "3l,658" for 31,658 and use decimal commas. Code accepts the O/0 and l/1 confusions on both sides of a quote check, but treats a gap over 25% as a misread rather than a restatement. That is why 5 of 15 fall back to screener, labelled.
- **Reliance:** PAT is ₹25,548 Cr in the filing vs ₹29,550 Cr on screener. The card shows screener's figure with the flag; I haven't traced which definition screener uses.

**Ask the calls**
- **Analyst answers:** the old ranking only *penalised* question marks, so an analyst's "my first question is pertaining to order inflow guidance of INR 27,000 crores" (BEL) was returned as the answer.
- **The fix:** speaker turns. Getting roles right broke in several ways:
  - Chola's call is hosted by a Kotak analyst, who appears as a named moderator.
  - Info Edge's IR head runs the queue and hands off by first name ("Sachin from Bank of America").
  - PDF text splits "l ine of".
  - A broker's name starts with a digit ("40 Cents").
  - The founder is introduced with a title and was briefly marked as an analyst.
- **A loss:** management answers that don't repeat the subject now rank lower. Gravita's "lead would grow at around 18% to 20%" was found before only because the window ran into the analyst's question; FINN now returns a less specific management sentence instead.

**UX**
- A first load once showed "Nothing needs you today, from 0 filings" (24h). I couldn't reproduce it in fresh contexts, so the default window is now computed on the server, and pages restored from the back/forward cache reset to it.
- The Research header's labels could overlap the ticker lists on narrow phones; they now stack.

## Known limitations / next

**Known limitations**
- **Classifier accuracy is self-graded.** Tier agreement was 73% (44/60) on a spot check that **I labelled myself**, as the assistant that built FINN. The post-fix 50/60 reuses the same sample. A second, independent annotator is the next step, and so is a larger sample.
- **Segment and USD promises aren't scored.** Persistent's "run-rate revenue of more than USD 1.7 billion" or PG Electroplast's "volume growth of close to 20% for Room AC" are shown as "can't be checked against reported totals". Scoring them needs segment tables and investor presentations, not just the P&L.
- **No real push notifications.** "New since your last visit" is computed on the device when you open the app; nothing reaches you if you don't. A web-push of the one-line header, once a day, is the intended design.
- **No stored tenure lookup.** A departing executive's tenure is shown only when the filing states it verbatim. Building a lookup from FINN's own history of appointment filings would fill most gaps, but it isn't built.
- **Speaker roles are heuristic.** Unusual formats still slip:
  - Page Industries' Q1 call spells an analyst two ways, so one spelling counts as management.
  - Reliance's transcript has no speaker labels, so FINN falls back to excluding anything phrased as a question.
- **Most filing checks are older or scanned.** Only text-layer PDFs from the last 30 days are checked. 25 older cards say "not checked against the filing", and scanned ones fall back.
- **Bull vs bear thresholds are mine and uncalibrated.** Examples: growth ≥15%, cash conversion <70%, debt-to-equity ≥0.5. Debt and working capital are skipped for lenders, but an unseen NBFC that screener doesn't mark as a lender could still be called "heavily indebted".

**Next**
- **Score segment and USD promises** against segment tables and investor presentations.
- **Calibrate** the classifier and the tolerances with a second human annotator.
- **Morning push:** the one-line header, once a day, nothing else.
- **Tenure lookup** from stored appointment filings.
- **NSE through a residential relay**, so filings land minutes earlier than on BSE.
- **OCR for scanned results PDFs**, so the 5 fallbacks can be checked too.
