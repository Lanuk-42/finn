"use client";

import { useEffect, useState } from "react";
import type { Promise_, PromiseFile, Snapshot, Stock } from "@/lib/types";
import { cr, pct, tone, when } from "@/lib/format";

const METRIC: Record<string, string> = {
  revenue: "Revenue", revenue_growth_yoy: "Revenue growth", ebitda_margin: "EBITDA margin", ebit_margin: "EBIT margin",
  pat_margin: "PAT margin", ebitda_growth_yoy: "EBITDA growth", pat_growth_yoy: "PAT growth", other: "Other",
};

export default function Research({ promises, stocks, initial }: { promises: PromiseFile[]; stocks: Stock[]; initial: string | null }) {
  const tracked = promises.map((p) => p.symbol);
  const [ticker, setTicker] = useState<string>(initial ?? tracked[0] ?? "TCS");
  const [input, setInput] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initial) setTicker(initial);
  }, [initial]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setSnap(null);
    fetch(`/api/snapshot/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((j: Snapshot) => live && setSnap(j))
      .catch((e) => live && setSnap({ ok: false, symbol: ticker, error: String(e) }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [ticker]);

  const pf = promises.find((p) => p.symbol === ticker);
  const go = (t: string) => { const s = t.trim().toUpperCase(); if (s) { setTicker(s); setInput(""); } };

  return (
    <div className="px-4">
      <header className="sticky top-0 z-20 -mx-4 border-b hairline bg-[var(--bg)]/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)] backdrop-blur">
        <h1 className="text-[22px] font-semibold tracking-tight">Research</h1>
        <form onSubmit={(e) => { e.preventDefault(); go(input); }} className="mt-2 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="Any NSE ticker, e.g. IRCTC"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="num min-w-0 flex-1 rounded-xl border hairline bg-[var(--card)] px-3 py-2 text-[15px] outline-none focus:border-[var(--ink)]"
          />
          <button className="rounded-xl bg-[var(--ink)] px-4 text-[14px] font-medium text-[var(--bg)]">Go</button>
        </form>
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          {[...tracked, ...stocks.map((s) => s.symbol).filter((s) => !tracked.includes(s))].map((s) => (
            <button key={s} onClick={() => go(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium ${ticker === s ? "bg-[var(--ink)] text-[var(--bg)]" : "chip text-[var(--muted)]"}`}>
              {tracked.includes(s) && <span className={ticker === s ? "" : "text-[var(--note)]"}>◆ </span>}{s}
            </button>
          ))}
        </div>
      </header>

      {pf && <Tracker pf={pf} />}
      {!pf && (
        <p className="mt-4 text-[12px] leading-snug text-[var(--faint)]">
          ◆ marks tickers with a precomputed promise tracker. Any other ticker gets the live financial snapshot below.
        </p>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-[15px] font-semibold">Financial snapshot <span className="text-[12px] font-normal text-[var(--faint)]">live from screener.in</span></h2>
        {loading && <div className="card h-48 animate-pulse" />}
        {!loading && snap && !snap.ok && <p className="card px-4 py-3 text-[14px] text-[var(--down)]">{snap.error}</p>}
        {!loading && snap?.ok && <SnapshotCard s={snap} />}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ promise tracker
function verdictPill(p: Promise_) {
  if (p.status === "standing") {
    const all = p.tested && p.held === p.tested;
    return { text: p.tested ? `Held ${p.held}/${p.tested} qtrs` : "No quarter yet", cls: p.tested ? (all ? "bg-[var(--up)]/15 text-[var(--up)]" : "bg-[var(--down)]/15 text-[var(--down)]") : "chip text-[var(--muted)]" };
  }
  if (p.status === "in_progress") return { text: "In progress", cls: "bg-[var(--note-bg)] text-[var(--note)]" };
  if (p.verdict === "Missed") return { text: "Missed", cls: "bg-[var(--down)]/15 text-[var(--down)]" };
  if (p.verdict === "Beat") return { text: "Beat", cls: "bg-[var(--up)]/20 text-[var(--up)]" };
  return { text: "Met", cls: "bg-[var(--up)]/15 text-[var(--up)]" };
}

function target(p: Promise_) {
  const u = p.unit === "crore" ? " Cr" : p.unit === "bps" ? " bps" : "%";
  const f = (n: number) => (p.unit === "crore" ? `₹${n.toLocaleString("en-IN")}` : `${n}`);
  if (p.low !== null && p.high !== null && p.low !== p.high) return `${f(p.low)}–${f(p.high)}${u}`;
  const v = p.low ?? p.high;
  if (v === null) return "—";
  const pre = p.kind === "at_least" ? "≥ " : p.kind === "at_most" ? "≤ " : p.kind === "about" ? "~" : "";
  return `${pre}${f(v)}${u}`;
}

function actualText(p: Promise_) {
  const v = p.status === "in_progress" ? p.tracking ?? p.actual : p.actual;
  if (v === null || v === undefined) return null;
  if (p.unit === "bps") return `${v > 0 ? "+" : ""}${v} bps`;
  if (p.metric === "revenue") return cr(v);
  return `${v}%`;
}

/** Tracking below the low end of the target (only meaningful for margins/growth/bps, not part-year revenue). */
function offTrack(p: Promise_) {
  const v = p.status === "in_progress" ? p.tracking ?? p.actual : p.actual;
  if (v == null || p.metric === "revenue" || p.low == null) return p.verdict === "Missed";
  return v < p.low;
}

function Tracker({ pf }: { pf: PromiseFile }) {
  const [sheet, setSheet] = useState<Promise_ | null>(null);
  const [showNC, setShowNC] = useState(false);
  const c = pf.credibility;
  const standing = pf.promises.filter((p) => p.status === "standing");
  const qHeld = standing.reduce((a, p) => a + (p.held ?? 0), 0);
  const qTested = standing.reduce((a, p) => a + (p.tested ?? 0), 0);
  const kept = c.kept + qHeld, checks = c.resolved + qTested;
  const calls = pf.transcripts.filter((t) => t.status === "ok").map((t) => t.quarter).reverse();

  return (
    <section className="mt-4">
      <div className="card px-4 py-4">
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--faint)]">Promise tracker · {pf.company}</p>
        <div className="mt-1 flex items-end gap-3">
          <p className="num text-[34px] font-semibold leading-none">
            {checks ? <>{kept}<span className="text-[20px] text-[var(--faint)]">/{checks}</span></> : "—"}
          </p>
          <p className="pb-1 text-[13px] leading-snug text-[var(--muted)]">
            checks kept: {c.kept}/{c.resolved} dated targets resolved{qTested > 0 && <>, plus {qHeld}/{qTested} quarters inside a standing range</>}.
            {c.in_progress > 0 && <> {c.in_progress} still in progress.</>}
          </p>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-[var(--faint)]">
          Calls read: {calls.join(" · ")}. Gemini only finds guidance and copies the quote; code verifies each quote, checks the number is in it, maps it to the reported table and decides the verdict.
        </p>
      </div>

      <div className="mt-2.5 space-y-2.5">
        {pf.promises.length === 0 && <p className="card px-4 py-3 text-[13px] text-[var(--muted)]">No company-level target in these calls can be checked against reported tables.</p>}
        {pf.promises.map((p, i) => {
          const pill = verdictPill(p);
          const a = actualText(p);
          return (
            <button key={i} onClick={() => setSheet(p)} className="card block w-full px-4 py-3 text-left">
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${pill.cls}`}>{pill.text}</span>
                <span className="text-[12px] text-[var(--faint)]">said {p.call} · for {p.period === "ongoing" ? "ongoing" : p.period}</span>
              </div>
              <p className="mt-1.5 text-[14px] font-medium leading-snug">{p.summary}</p>
              <div className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px]">
                <span className="text-[var(--muted)]">{METRIC[p.metric]} target <b className="text-[var(--ink)]">{target(p)}</b></span>
                {a && <span className="text-[var(--muted)]">{p.status === "in_progress" ? "so far" : "actual"} <b className={offTrack(p) ? "text-[var(--down)]" : "text-[var(--ink)]"}>{a}</b></span>}
              </div>
              {p.status === "standing" && p.checks && p.checks.length > 0 && (
                <div className="mt-2 flex gap-1">
                  {p.checks.map((q) => (
                    <span key={q.quarter} className={`num rounded px-1.5 py-0.5 text-[10px] ${q.verdict === "Missed" ? "bg-[var(--down)]/15 text-[var(--down)]" : "bg-[var(--up)]/15 text-[var(--up)]"}`}>
                      {q.quarter.replace(" 20", " '")} {q.value}%
                    </span>
                  ))}
                </div>
              )}
              {p.followups.length > 0 && <p className="mt-1.5 text-[11px] text-[var(--faint)]">Repeated in {p.followups.map((f) => f.call).join(", ")}</p>}
              <p className="mt-1.5 text-[11px] font-medium text-[var(--note)]">Tap for the exact quote</p>
            </button>
          );
        })}
      </div>

      {pf.not_checkable.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowNC((v) => !v)} className="flex w-full justify-between py-2 text-left text-[13px] text-[var(--muted)]">
            <span>{pf.not_checkable.length} more promises can&apos;t be checked against reported tables</span>
            <span>{showNC ? "Hide" : "Show"}</span>
          </button>
          {showNC && (
            <div className="card divide-y divide-[var(--line)] overflow-hidden">
              {pf.not_checkable.map((p, i) => (
                <button key={i} onClick={() => setSheet(p)} className="block w-full px-4 py-2.5 text-left">
                  <p className="text-[13px] leading-snug">{p.summary}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--faint)]">{p.call} · {p.reason}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {pf.rejected.length > 0 && (
        <p className="mt-2 text-[11px] text-[var(--faint)]">
          {pf.rejected.length} extracted claims were thrown out by code ({[...new Set(pf.rejected.map((r) => r.reason))].join("; ")}).
        </p>
      )}

      {sheet && <QuoteSheet p={sheet} onClose={() => setSheet(null)} />}
    </section>
  );
}

function QuoteSheet({ p, onClose }: { p: Promise_; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div className="mx-auto max-h-[80dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-[var(--card)] px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--line)]" />
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--faint)]">{p.call} earnings call{p.speaker ? ` · ${p.speaker}` : ""}</p>
        <blockquote className="mt-2 border-l-[3px] border-[var(--ink)] pl-3 text-[16px] leading-relaxed">“{p.quote}”</blockquote>
        <p className="mt-2 text-[11px] font-medium text-[var(--up)]">✓ Quote found verbatim in the transcript</p>
        {p.basis && <p className="num mt-3 text-[13px] text-[var(--muted)]">Checked against: {p.basis}{p.base ? ` (base ${p.base})` : ""}</p>}
        {p.reason && p.status !== "in_progress" && <p className="mt-3 text-[13px] text-[var(--muted)]">Not scored: {p.reason}</p>}
        {p.followups.map((f, i) => (
          <div key={i} className="mt-4">
            <p className="text-[12px] font-medium text-[var(--faint)]">Repeated in {f.call}</p>
            <blockquote className="mt-1 border-l-2 hairline pl-3 text-[14px] leading-relaxed text-[var(--muted)]">“{f.quote}”</blockquote>
          </div>
        ))}
        <a href={p.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[13px] font-medium underline decoration-[var(--line)] underline-offset-2">Open transcript PDF</a>
        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-[var(--chip)] py-3 text-[14px] font-medium">Close</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ live snapshot
function SnapshotCard({ s }: { s: Snapshot }) {
  const L = s.latest!;
  const rows: [string, "revenue" | "ebitda" | "pbt" | "pat"][] = [["Revenue", "revenue"], ["EBITDA", "ebitda"], ["PBT", "pbt"], ["PAT", "pat"]];
  const keep = ["Market Cap", "Current Price", "Stock P/E", "ROCE", "ROE", "Dividend Yield"];
  const maxRev = Math.max(...(s.trend ?? []).map((t) => t.revenue ?? 0), 1);
  return (
    <div className="card px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[16px] font-semibold">{s.name}</p>
        <a href={s.url} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] text-[var(--faint)] underline underline-offset-2">{s.variant}</a>
      </div>
      {s.about && <p className="clamp-2 mt-1 text-[12px] leading-snug text-[var(--muted)]">{s.about}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {keep.filter((k) => s.ratios?.[k]).map((k) => (
          <span key={k} className="chip num px-2.5 py-1 text-[12px]"><span className="text-[var(--muted)]">{k.replace("Stock ", "")}</span> {s.ratios![k].replace(/\s*Cr\.$/, " Cr")}</span>
        ))}
      </div>

      <div className="num mt-4 grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-4 gap-y-1.5 text-[13px]">
        <span className="text-[11px] uppercase tracking-wide text-[var(--faint)]">{L.quarter}</span>
        <span className="text-right text-[11px] uppercase tracking-wide text-[var(--faint)]">₹ Cr</span>
        <span className="text-right text-[11px] uppercase tracking-wide text-[var(--faint)]">QoQ</span>
        <span className="text-right text-[11px] uppercase tracking-wide text-[var(--faint)]">YoY</span>
        {rows.map(([label, k]) => {
          const l = L.lines[k];
          return (
            <span key={k} className="contents">
              <span className="text-[var(--muted)]">{label}</span>
              <span className="text-right font-medium">{l?.value?.toLocaleString("en-IN", { maximumFractionDigits: 0 }) ?? "—"}</span>
              <span className={`text-right ${tone(l?.qoq)}`}>{l ? pct(l.qoq) : L.is_bank && k === "ebitda" ? "n/a" : "—"}</span>
              <span className={`text-right ${tone(l?.yoy)}`}>{l ? pct(l.yoy) : L.is_bank && k === "ebitda" ? "bank" : "—"}</span>
            </span>
          );
        })}
      </div>
      {L.ebitda_margin !== null && (
        <p className="num mt-2 text-[12px] text-[var(--muted)]">
          EBITDA margin <b className="text-[var(--ink)]">{L.ebitda_margin}%</b> vs {L.ebitda_margin_ya ?? "—"}% a year ago
        </p>
      )}

      {s.trend && s.trend.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-[var(--faint)]">Revenue, last {s.trend.length} quarters{L.ebitda_margin !== null ? " · EBITDA margin" : ""}</p>
          {/* minmax(0,1fr) lets columns shrink below their label width, so 8 bars fit a 320px phone */}
          <div className="mt-2 grid h-28 items-end gap-1" style={{ gridTemplateColumns: `repeat(${s.trend.length}, minmax(0, 1fr))` }}>
            {s.trend.map((t) => (
              <div key={t.quarter} className="flex min-w-0 flex-col items-center justify-end gap-1">
                {t.margin !== null && <span className="num text-[9px] leading-none text-[var(--muted)]">{t.margin}</span>}
                <div className="w-full max-w-[28px] rounded-t bg-[var(--ink)]/80" style={{ height: `${Math.max(4, ((t.revenue ?? 0) / maxRev) * 60)}px` }} />
                <span className="num text-center text-[9px] leading-[1.1] text-[var(--faint)]">{t.quarter.slice(0, 3)}<br />&apos;{t.quarter.slice(-2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] text-[var(--faint)]">Fetched {s.fetched_at ? when(s.fetched_at) : ""} · QoQ/YoY and margins computed in code from the table</p>
    </div>
  );
}
