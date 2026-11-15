# FINN: write-up

**Live:** https://finn-wine.vercel.app · **Details:** [README.md](README.md)

## What I built

FINN is a morning note for an 18-stock Indian portfolio. The holdings include a state-owned company, two drug makers, a bank, a lender and three small companies.

- **The Brief.** It reads every exchange filing and keeps the few that need you: today, 16 items from 230 filings over 30 days. It orders them by how serious they are, and says why in one plain sentence.
- **Research.** It answers one question: can I trust this management? It scores what management promised on earnings calls against reported numbers. BEL beat both of its FY26 targets. PG Electroplast missed its FY26 sales guidance by 7%.

## The interaction point of view

FINN is a short note that ends, not a feed and not a chatbot.

An investor's scarcest resource is attention. So the Brief opens on one sentence with a count, puts the most serious items first, and lets you clear each one until nothing is left. There is no chatbot, because a chatbot invites the model to talk. The ask box returns only management's own words with a page number, or says it found nothing. Every verdict comes first, and the evidence is one tap away.

## Five key decisions

1. **The model only quotes, and code decides.** The model copies sentences and table rows. Code checks each one against the source, computes every number and picks every verdict.
   - *Trade-off:* the model finds fewer items than a free-form summary would, but everything shown can be checked.
2. **Fixed rules sort the filings.** Ordered rules sort them, not a model.
   - *Trade-off:* rules miss unusual wording; a spot check found 73% agreement. In return, sorting costs nothing and every decision says which rule fired.
3. **Severity order, not date order.** A broken thesis line comes before a new director, even if the director was announced later. Good or in-line results drop to "Worth a look".
   - *Trade-off:* the list no longer reads like a timeline, so each item shows its date.
4. **Every number links to its source.** A figure opens the filing or transcript at its page, or the screener.in table it came from.
   - *Trade-off:* more links on the page. I kept them as dotted underlines so they don't dominate.
5. **Cheap models by default, a stronger one only for long reading.** Short filings use the lite model. Earnings calls use the best available Flash model, falling back to lite. A hard cap limits new calls per run.
   - *Trade-off:* when the free quota runs out, tracker builds pause instead of producing a weaker result.

## What I left out, and why

- **LinkedIn content.** Bios come only from the filing, so they can be verified. FINN links to a LinkedIn people search instead.
- **Model-written summaries.** They are where unchecked claims creep in. Bull vs bear exists only because code templates can write it.
- **Accounts, intraday prices and push alerts.** The note is read once a day. Settings live on your device.
- **NSE as the live source.** It blocks cloud servers. A relay would fix it, but that is infrastructure, not product.

## What broke and how it was handled

- **Blocked and changing sources.** NSE blocked every cloud server, so FINN switched to BSE. A retired model, a 30-second network timeout and a 20-call daily quota all broke model calls. The fixes were a fallback chain, streamed responses and caching every answer by document.
- **Analyst questions taken as guidance.** Both the promise tracker and the ask box did this at first. FINN now splits each call into speaker turns and never returns an analyst's words. On an 18-question check, analyst answers went from 2 to 0.
- **Scanned results PDFs.** They misread digits. A gap of more than 25% from screener.in is treated as a misread, not a restatement, so 5 of 15 checks fall back to screener's figures, labelled.
- **Duplicated and noisy alerts.** A chairman moving to chairman emeritus showed as a departure plus an arrival; it is now one line. Rating actions appeared both in Patterns and in Act on; now they appear once.
- **Quota outages.** When Gemini returns quota or missing-model errors, the daily refresh still saves prices and filings, and tracker builds pause. I tested both by forcing each error.

## What's next

- Score segment-level and US-dollar promises against segment tables.
- Have a second person label the filing check, and calibrate the tolerances.
- Send one daily notification with the headline.
- Build a stored history of appointments, so tenure is known even when a filing omits it.
- Read scanned PDFs with optical character recognition (OCR).
