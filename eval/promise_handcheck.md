# Promise verdicts checked by hand against the transcript PDFs and the annual tables

Checked by Claude (the coding assistant) on 15 Nov 2026. For each verdict, the quote was located on its page in the original BSE transcript PDF, and the actual was recomputed by hand from screener's annual P&L.

| # | Promise | Where it was said | Hand calculation | FINN verdict | Check |
|---|---|---|---|---|---|
| 1 | BEL FY26 revenue growth "around 15%" | May 2025 call (Q4 FY25), PDF p.22. The moderator asks "Shri Manoj ji" to reiterate the FY26 guidance, and **Manoj Jain** says: "So our guidance for financial year '25, '26 is revenue growth around 15%, EBITDA margin around 27%, order inflow more than INR27,000 crores." | Sales FY25 ₹23,769 Cr → FY26 ₹27,610 Cr = **+16.16%** | Beat | ✓ Correct under FINN's rules. Borderline: 1.16pp above "around 15%", with a ±1pp tolerance. A human might call it "met, slightly ahead". |
| 2 | BEL FY26 EBITDA margin "around 27%" | Same sentence, same page | Operating profit ₹8,053 Cr ÷ sales ₹27,610 Cr = **29.17%** | Beat | ✓ Clear: 2.2pp above the target. |
| 3 | PG Electroplast FY26 sales ₹5,700–5,800 Cr | Q3 FY26 call, PDF p.4: "We are maintaining our guidance, which we have given in the first quarter '26 of INR5,700 crores to INR5,800 crores of sales, about INR300 crores of profit." | FY26 consolidated sales **₹5,288 Cr**, 7.2% below the low end | Missed | ✓ Clear. Note that the guidance was *maintained* in Q3, with one quarter left. |

What the check also showed:
- PDF text splits words ("fo r", "cro res"). The quote checker's whitespace- and hyphen-insensitive second pass is what lets these real quotes verify. Every letter and digit must still match, in order.
- The speaker field comes from the model. For #1 it was right (Manoj Jain). For #3 it was left empty.
