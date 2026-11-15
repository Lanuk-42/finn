"use client";

import { useState } from "react";
import type { Promise_, PromiseFile } from "@/lib/types";
import { actualTable, actualText, pdfAt, screenerAt, shortName, targetText } from "@/lib/lead";

const METRIC: Record<string, string> = {
  revenue: "sales", revenue_growth_yoy: "revenue growth", ebitda_margin: "EBITDA margin", ebit_margin: "EBIT margin",
  pat_margin: "PAT margin", pat_growth_yoy: "profit growth", ebitda_growth_yoy: "EBITDA growth",
};

/** The clearest resolved miss across all trackers (largest shortfall vs the low end), else the clearest beat. */
export function pickProof(files: PromiseFile[]): { pf: PromiseFile; p: Promise_ } | null {
  const all = files.flatMap((pf) => pf.promises.filter((p) => p.status === "resolved" && p.actual != null).map((p) => ({ pf, p })));
  const gap = (p: Promise_) => (p.low ? Math.abs((p.actual! - p.low) / p.low) : 0);
  const missed = all.filter((x) => x.p.verdict === "Missed").sort((a, b) => gap(b.p) - gap(a.p));
  return missed[0] ?? all.sort((a, b) => gap(b.p) - gap(a.p))[0] ?? null;
}

/** Top of Research: one real verdict, so the reader sees what "code decides" means before anything else. */
export default function Proof({ files, onOpen }: { files: PromiseFile[]; onOpen: (sym: string) => void }) {
  const [quote, setQuote] = useState(false);
  const pick = pickProof(files);
  if (!pick) return null;
  const { pf, p } = pick;
  const name = shortName(pf.symbol, pf.company);
  const missed = p.verdict === "Missed";
  const pctOff = p.low ? Math.round(Math.abs((p.actual! - p.low) / p.low) * 1000) / 10 : null;
  return (
    <section className="mt-4 border-y border-[var(--rule-strong)] py-3">
      <div className="flex items-baseline justify-between">
        <span className="label !text-[var(--ink)]">Code decides</span>
        <span className={`border px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.08em] ${missed ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]" : "border-[var(--ink)]"}`}>{p.verdict}</span>
      </div>
      <p className="serif mt-1.5 text-[19px] font-medium leading-[1.3]">
        {name} guided <a href={pdfAt(p.source_url, p.page)} target="_blank" rel="noreferrer" className="src">{targetText(p)}</a> of {p.period} {METRIC[p.metric] ?? p.metric}. It delivered{" "}
        <a href={screenerAt(pf.screener_url, pf.symbol, actualTable(p))} target="_blank" rel="noreferrer" className={`src ${missed ? "text-[var(--accent)]" : ""}`}>{actualText(p)}</a>
        {pctOff != null && missed ? `, ${pctOff}% short.` : "."}
      </p>
      <div className="mt-2 flex gap-4 text-[13px]">
        <button onClick={() => setQuote((v) => !v)} className="link text-[var(--muted)]">{quote ? "Hide" : "The quote and the check"}</button>
        <button onClick={() => onOpen(pf.symbol)} className="link text-[var(--ink)]">{name}’s tracker →</button>
      </div>
      {quote && (
        <>
          <p className="mt-2 text-[13px] leading-snug text-[var(--muted)]">
            A model found the sentence in the {p.call} earnings call. Code checked it word for word, read {p.period} {METRIC[p.metric] ?? p.metric} from the reported P&amp;L and decided the verdict.
          </p>
          <blockquote className="serif mt-2 border-l-2 border-[var(--ink)] pl-3 text-[15px] leading-snug">“{p.quote}”</blockquote>
          <a href={pdfAt(p.source_url, p.page)} target="_blank" rel="noreferrer" className="link mt-1 inline-block text-[12px] text-[var(--muted)]">{p.call} transcript{p.page ? `, page ${p.page}` : ""} ↗</a>
        </>
      )}
    </section>
  );
}
