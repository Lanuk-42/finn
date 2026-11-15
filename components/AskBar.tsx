"use client";

import { useEffect, useState } from "react";
import type { Answer } from "@/lib/ask";

/** Ask the company's own earnings calls. Answers are verbatim passages with call and page, or a plain refusal. */
export default function AskBar({ ticker, name }: { ticker: string; name: string }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [ans, setAns] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [how, setHow] = useState(false);
  useEffect(() => { setAns(null); setAsked(""); setQ(""); }, [ticker]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setAsked(q.trim());
    try {
      const r = await fetch(`/api/ask?ticker=${encodeURIComponent(ticker)}&q=${encodeURIComponent(q.trim())}`);
      setAns(await r.json());
    } catch {
      setAns({ found: false, reason: "the question couldn’t be sent", searched: [] });
    }
    setBusy(false);
  };

  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between border-b border-[var(--rule-strong)] pb-1.5">
        <h2 className="label !text-[var(--ink)]">Ask the calls</h2>
        <span className="num text-[12px] text-[var(--muted)]">answers are quotes</span>
      </div>
      <form onSubmit={submit} className="mt-3 flex items-end gap-3 border-b border-[var(--ink)] pb-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`e.g. What is ${name}’s margin guidance?`} aria-label={`Ask about ${name}`}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--faint)]" />
        <button className="text-[14px] font-semibold" disabled={busy}>{busy ? "…" : "Ask →"}</button>
      </form>
      {busy && <p className="serif py-3 text-[15px] text-[var(--muted)]">Reading {name}’s latest earnings calls…</p>}
      {ans && (
        <div className="border-b rule py-4">
          <p className="text-[13px] text-[var(--muted)]">{asked}</p>
          {ans.found ? (
            <>
              <blockquote className="serif mt-2 border-l-2 border-[var(--ink)] pl-3 text-[17px] leading-[1.45]">“{ans.quote}”</blockquote>
              <p className="num mt-2 text-[13px] text-[var(--muted)]">
                {ans.quarter} earnings call, page {ans.page} · <a href={`${ans.url}#page=${ans.page}`} target="_blank" rel="noreferrer" className="link text-[var(--ink)]">Open transcript</a>
              </p>
            </>
          ) : (
            <p className="serif mt-2 text-[18px] leading-snug">Not found in the documents.</p>
          )}
          <button onClick={() => setHow((v) => !v)} className="link mt-2 text-[13px] text-[var(--muted)]">How FINN checked this</button>
          {how && (
            <div className="mt-2 space-y-1.5 border-l rule pl-3 text-[13px] leading-relaxed text-[var(--muted)]">
              <p>FINN searched {ans.searched.length ? `the ${ans.searched.join(", ")} earnings-call transcripts` : "the transcripts on file"}{(ans as { live?: boolean }).live ? " (fetched just now from the exchange filings screener links to)" : ""} sentence by sentence. No model writes the answer: it is the best-matching passage, shown word for word, and only if it clears a relevance bar.</p>
              {ans.found ? <p>Matched on: {ans.matched.join(", ")}. The passage was checked to appear exactly on page {ans.page}.</p> : <p>Why nothing: {ans.reason}.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
