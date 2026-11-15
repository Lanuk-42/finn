"use client";

import { useEffect, useState } from "react";
import type { Promise_, PromiseFile, Snapshot, Stock } from "@/lib/types";
import { fyq, when } from "@/lib/format";
import ExtrasView from "./Extras";
import { actualText, isBad, promiseTitle, shortName, snapshotLead, targetText, trackerLead, verdictLabel } from "@/lib/lead";

export default function Research({ promises, stocks, initial }: { promises: PromiseFile[]; stocks: Stock[]; initial: string | null }) {
  const tracked = promises.map((p) => p.symbol);
  const [ticker, setTicker] = useState<string>(initial ?? tracked[0] ?? "TCS");
  const [input, setInput] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (initial) setTicker(initial); }, [initial]);

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
  const portfolio = stocks.find((s) => s.symbol === ticker);
  const name = shortName(snap?.ok && snap.symbol !== ticker ? snap.symbol : ticker, portfolio?.name ?? (snap?.ok ? snap.name : undefined));
  const go = (t: string) => { const s = t.trim().toUpperCase(); if (s) { setTicker(s); setInput(""); } };

  return (
    <div className="px-5">
      <header className="pt-[max(env(safe-area-inset-top),18px)]">
        <div className="flex items-baseline justify-between border-b-2 border-[var(--rule-strong)] pb-2">
          <span className="serif text-[17px] font-bold tracking-[0.02em]">FINN</span>
          <span className="label">Research</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go(input); }} className="mt-4 flex items-end gap-3 border-b border-[var(--ink)] pb-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="Look up any NSE ticker"
            aria-label="NSE ticker"
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            className="num min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-[var(--faint)]"
          />
          <button className="text-[14px] font-semibold">Go →</button>
        </form>
        <TickerIndex label="Promise trackers" list={tracked} active={ticker} onPick={go} />
        <TickerIndex label="Portfolio" list={stocks.map((s) => s.symbol).filter((s) => !tracked.includes(s))} active={ticker} onPick={go} />
      </header>

      <h1 className="serif mt-8 text-[30px] font-semibold leading-[1.1] tracking-[-0.01em]">
        {snap?.ok ? snap.name?.replace(/\s*\(searched.*\)$/, "") : portfolio?.name ?? ticker}
      </h1>
      <p className="label mt-1">{ticker}{portfolio ? ` · ${portfolio.sector} · ${portfolio.cap} cap` : ""}</p>

      {pf && <Tracker pf={pf} name={name} />}

      <section className="mt-9">
        <div className="flex items-baseline justify-between border-b border-[var(--rule-strong)] pb-1.5">
          <h2 className="label !text-[var(--ink)]">Latest quarter</h2>
          {snap?.ok && snap.latest && <span className="num text-[12px] text-[var(--muted)]">{fyq(snap.latest.quarter)}</span>}
        </div>
        {loading && <p className="serif py-4 text-[16px] text-[var(--muted)]">Reading {ticker} from screener.in…</p>}
        {!loading && snap && !snap.ok && (
          <p className="serif border-b rule py-4 text-[16px] leading-snug text-[var(--ink-2)]">
            {snap.error?.startsWith("No quarterly") ? <>Couldn’t find {ticker} on screener.in. Try the current NSE symbol (Zomato is now ETERNAL).</> : <>Couldn’t load {ticker}: {snap.error}</>}
          </p>
        )}
        {!loading && snap?.ok && <SnapshotBody s={snap} name={name} />}
      </section>
      {!loading && snap?.ok && snap.extras && <ExtrasView x={snap.extras} name={name} />}
      <div className="h-8" />
    </div>
  );
}

function TickerIndex({ label, list, active, onPick }: { label: string; list: string[]; active: string; onPick: (s: string) => void }) {
  if (!list.length) return null;
  return (
    <div className="mt-3 flex gap-3">
      <span className="label w-[72px] shrink-0 pt-[3px] !text-[10px] leading-tight">{label}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {list.map((s) => (
          <button key={s} onClick={() => onPick(s)}
            className={`num text-[13px] ${active === s ? "font-semibold text-[var(--ink)] underline decoration-2 underline-offset-4" : "text-[var(--muted)]"}`}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ promise tracker
function Tracker({ pf, name }: { pf: PromiseFile; name: string }) {
  const [sheet, setSheet] = useState<Promise_ | null>(null);
  const [how, setHow] = useState(false);
  const c = pf.credibility;
  const standing = pf.promises.filter((p) => p.status === "standing");
  const qHeld = standing.reduce((a, p) => a + (p.held ?? 0), 0);
  const qTested = standing.reduce((a, p) => a + (p.tested ?? 0), 0);
  const kept = c.kept + qHeld, checks = c.resolved + qTested;
  const calls = pf.transcripts.filter((t) => t.status === "ok").map((t) => t.quarter).reverse();

  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between border-b border-[var(--rule-strong)] pb-1.5">
        <h2 className="label !text-[var(--ink)]">Promises vs delivery</h2>
        <span className="num text-[12px] text-[var(--muted)]">{calls.length} calls</span>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <p className="serif num text-[52px] font-semibold leading-[0.9]">
          {checks ? <>{kept}<span className="text-[30px] text-[var(--faint)]">/{checks}</span></> : "—"}
        </p>
        <p className="pb-1 text-[13px] leading-tight text-[var(--muted)]">{checks ? <>promises<br />kept</> : <>nothing<br />checkable yet</>}</p>
      </div>
      <p className="serif mt-3 text-[19px] leading-[1.3]">{trackerLead(name, pf)}</p>

      <div className="mt-4">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b rule pb-1 text-[11px] uppercase tracking-[0.08em] text-[var(--faint)]">
          <span>Promise</span><span className="text-right">Actual</span><span className="text-right">Verdict</span>
        </div>
        {pf.promises.length === 0 && <p className="serif border-b rule py-4 text-[16px] text-[var(--ink-2)]">No company-wide target in these calls can be checked against reported numbers.</p>}
        {pf.promises.map((p, i) => (
          <button key={i} onClick={() => setSheet(p)} className="grid w-full grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-b rule py-3 text-left">
            <span>
              <span className="block text-[15px] leading-snug">{promiseTitle(p)}</span>
              <span className="num block text-[12px] text-[var(--faint)]">said {p.call}{p.followups.length ? `, repeated ${p.followups.length}×` : ""}</span>
              {p.status === "standing" && p.checks && p.checks.length > 0 && (
                <span className="num mt-1 block text-[12px] text-[var(--muted)]">
                  {p.checks.map((q, j) => (
                    <span key={q.quarter} className={q.verdict === "Missed" ? "text-[var(--accent)]" : ""}>
                      {j > 0 && " · "}{q.quarter.slice(0, 3)} ’{q.quarter.slice(-2)} {q.value}%
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className={`num text-right text-[17px] font-semibold ${isBad(p) ? "text-[var(--accent)]" : ""}`}>
              {actualText(p)}
              {p.status === "in_progress" && <span className="block text-[11px] font-normal text-[var(--faint)]">so far</span>}
            </span>
            <span className="text-right"><Verdict p={p} /></span>
          </button>
        ))}
      </div>

      <button onClick={() => setHow((v) => !v)} className="link mt-3 text-[13px] text-[var(--muted)]">How FINN checked this</button>
      {how && (
        <div className="mt-2 space-y-3 border-l rule pl-3 text-[13px] leading-relaxed text-[var(--muted)]">
          <p>Calls read: <span className="num">{calls.join(", ")}</span>. A model only found guidance and copied the exact sentence. Code checked the sentence exists in the transcript, that the target number is in it, mapped it to the reported table and decided the verdict. Each target is judged on the first call that stated it.</p>
          <p>“Promises kept” counts dated targets that finished on or above the promise, plus quarters that stayed inside an ongoing range.</p>
          {pf.not_checkable.length > 0 && (
            <div>
              <p className="text-[var(--ink-2)]">{pf.not_checkable.length} statements can’t be checked against reported totals (segment, USD or qualified targets):</p>
              <ul className="mt-1 space-y-1">
                {pf.not_checkable.map((p, i) => (
                  <li key={i}><button onClick={() => setSheet(p)} className="text-left"><span className="link">{p.summary}</span> <span className="text-[var(--faint)]">({p.call})</span></button></li>
                ))}
              </ul>
            </div>
          )}
          {pf.rejected.length > 0 && (
            <p>{pf.rejected.length} extracted claim{pf.rejected.length > 1 ? "s were" : " was"} thrown out: {[...new Set(pf.rejected.map((r) => r.reason))].join("; ")}.</p>
          )}
          {pf.transcripts.some((t) => t.status !== "ok") && <p>Skipped: {pf.transcripts.filter((t) => t.status !== "ok").map((t) => `${t.label} (${t.status.replace(/_/g, " ")})`).join(", ")}.</p>}
        </div>
      )}

      {sheet && <QuoteSheet p={sheet} onClose={() => setSheet(null)} />}
    </section>
  );
}

function Verdict({ p }: { p: Promise_ }) {
  const label = p.status === "not_checkable" ? "Not scored" : verdictLabel(p);
  const bad = p.status !== "not_checkable" && isBad(p);
  return (
    <span className={`inline-block whitespace-nowrap border px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.08em] ${bad ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]" : "border-[var(--ink)] text-[var(--ink)]"}`}>
      {label}
    </span>
  );
}

function QuoteSheet({ p, onClose }: { p: Promise_; onClose: () => void }) {
  const [how, setHow] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/35" onClick={onClose}>
      <div className="mx-auto max-h-[82dvh] w-full max-w-[560px] overflow-y-auto border-t border-[var(--ink)] bg-[var(--paper)] px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <span className="label">{p.call} earnings call</span>
          {p.status !== "not_checkable" && <Verdict p={p} />}
        </div>
        <p className="mt-3 text-[15px] font-semibold">{p.status === "not_checkable" ? p.summary : promiseTitle(p)}</p>
        {p.status !== "not_checkable" && (
          <p className="num mt-0.5 text-[14px] text-[var(--muted)]">Promised {targetText(p)} · {p.status === "in_progress" ? "so far" : "actual"} <b className={isBad(p) ? "text-[var(--accent)]" : "text-[var(--ink)]"}>{actualText(p)}</b></p>
        )}
        <blockquote className="serif mt-4 border-l-2 border-[var(--ink)] pl-3 text-[18px] leading-[1.45]">“{p.quote}”</blockquote>
        {p.speaker && <p className="mt-2 text-[13px] text-[var(--muted)]">— {p.speaker}</p>}
        {p.followups.map((f, i) => (
          <div key={i} className="mt-4">
            <p className="label">Repeated in {f.call}</p>
            <blockquote className="serif mt-1 border-l rule pl-3 text-[15px] leading-snug text-[var(--ink-2)]">“{f.quote}”</blockquote>
          </div>
        ))}
        <div className="mt-5 flex items-baseline gap-4 text-[13px] text-[var(--muted)]">
          <a href={p.source_url} target="_blank" rel="noreferrer" className="link text-[var(--ink)]">Transcript</a>
          <button onClick={() => setHow((v) => !v)} className="link">How FINN checked this</button>
        </div>
        {how && (
          <div className="mt-2 space-y-1.5 border-l rule pl-3 text-[13px] leading-relaxed text-[var(--muted)]">
            <p>The quote was found word-for-word in the transcript, and the target number appears inside it.</p>
            {p.basis && <p className="num">Checked against: {p.basis}{p.base ? ` (base ${p.base})` : ""}.</p>}
            {p.reason && <p>{p.status === "not_checkable" ? "Not scored" : "Note"}: {p.reason}.</p>}
          </div>
        )}
        <button onClick={onClose} className="mt-6 w-full border-t border-[var(--ink)] py-3 text-[14px] font-semibold">Close</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ live snapshot
const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`);
function sig(n: number | null | undefined) {
  if (n == null) return "text-[var(--faint)]";
  if (n <= -5) return "text-[var(--accent)] font-semibold";
  if (n >= 15) return "font-semibold";
  return "text-[var(--ink-2)]";
}

function SnapshotBody({ s, name }: { s: Snapshot; name: string }) {
  const [how, setHow] = useState(false);
  const [about, setAbout] = useState(false);
  const L = s.latest!;
  const rows: [string, "revenue" | "ebitda" | "pbt" | "pat"][] = [["Revenue", "revenue"], ["EBITDA", "ebitda"], ["PBT", "pbt"], ["PAT", "pat"]];
  const ratioKeys: [string, string][] = [["Market Cap", "Market cap"], ["Current Price", "Price"], ["Stock P/E", "P/E"], ["ROCE", "ROCE"], ["ROE", "ROE"], ["Dividend Yield", "Div. yield"]];
  const ratios = ratioKeys.filter(([k]) => s.ratios?.[k]);
  const maxRev = Math.max(...(s.trend ?? []).map((t) => t.revenue ?? 0), 1);
  const mDelta = L.ebitda_margin != null && L.ebitda_margin_ya != null ? Math.round((L.ebitda_margin - L.ebitda_margin_ya) * 10) / 10 : null;
  const prevM = s.trend && s.trend.length >= 2 ? s.trend[s.trend.length - 2].margin : null;
  const mQoq = L.ebitda_margin != null && prevM != null ? Math.round((L.ebitda_margin - prevM) * 10) / 10 : null;
  const ppTxt = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}pp`);
  const ppCls = (n: number | null) => (n == null ? "text-[var(--faint)]" : n <= -1 ? "font-semibold text-[var(--accent)]" : n >= 1 ? "font-semibold" : "text-[var(--ink-2)]");

  return (
    <div>
      <p className="serif mt-3 text-[19px] leading-[1.3]">{snapshotLead(name, s)}</p>

      <table className="num mt-3 w-full text-[15px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--faint)]">
            <th className="pb-1 text-left font-medium">₹ crore</th>
            <th className="pb-1 text-right font-medium">{fyq(L.quarter).replace(" ", " ")}</th>
            <th className="pb-1 text-right font-medium">QoQ</th>
            <th className="pb-1 text-right font-medium">YoY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, k]) => {
            const l = L.lines[k];
            return (
              <tr key={k} className="border-t rule">
                <td className="py-1.5 text-[14px] text-[var(--muted)]">{label}</td>
                <td className="py-1.5 text-right font-semibold">{l?.value != null ? l.value.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : L.is_bank && k === "ebitda" ? "n/a" : "—"}</td>
                <td className={`py-1.5 pl-3 text-right ${sig(l?.qoq)}`}>{l ? fmtPct(l.qoq) : ""}</td>
                <td className={`py-1.5 pl-3 text-right ${sig(l?.yoy)}`}>{l ? fmtPct(l.yoy) : ""}</td>
              </tr>
            );
          })}
          {L.ebitda_margin != null && (
            <tr className="border-t rule">
              <td className="py-1.5 text-[14px] text-[var(--muted)]">EBITDA margin</td>
              <td className="py-1.5 text-right font-semibold">{L.ebitda_margin}%</td>
              <td className={`py-1.5 pl-3 text-right ${ppCls(mQoq)}`}>{ppTxt(mQoq)}</td>
              <td className={`py-1.5 pl-3 text-right ${ppCls(mDelta)}`}>{ppTxt(mDelta)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {ratios.length > 0 && (
        <dl className="num mt-5 grid grid-cols-3 border-t rule">
          {ratios.map(([k, label]) => (
            <div key={k} className="border-b rule py-2 pr-2">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-[var(--faint)]">{label}</dt>
              <dd className="text-[15px] font-semibold">{s.ratios![k].replace(/\s*Cr\.$/, " Cr").replace(/\s+%/, "%").replace(/₹\s+/, "₹")}</dd>
            </div>
          ))}
        </dl>
      )}

      {s.trend && s.trend.length > 0 && (
        <div className="mt-6">
          <p className="label">Revenue by quarter{L.ebitda_margin != null ? " · EBITDA margin %" : ""}</p>
          {/* minmax(0,1fr) lets columns shrink below their label width, so 8 bars fit a 320px phone */}
          <div className="mt-3 grid h-28 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${s.trend.length}, minmax(0, 1fr))` }}>
            {s.trend.map((t, i) => (
              <div key={t.quarter} className="flex min-w-0 flex-col items-center justify-end gap-1">
                {t.margin !== null && <span className="num text-[10px] leading-none text-[var(--muted)]">{t.margin}</span>}
                <div className={`w-full max-w-[26px] ${i === s.trend!.length - 1 ? "bg-[var(--ink)]" : "bg-[var(--faint)]/60"}`} style={{ height: `${Math.max(3, ((t.revenue ?? 0) / maxRev) * 60)}px` }} />
                <span className="num text-center text-[10px] leading-[1.1] text-[var(--faint)]">{t.quarter.slice(0, 3)}<br />’{t.quarter.slice(-2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-4 text-[13px] text-[var(--muted)]">
        {s.about && <button onClick={() => setAbout((v) => !v)} className="link">About {name}</button>}
        <button onClick={() => setHow((v) => !v)} className="link">How FINN checked this</button>
      </div>
      {about && s.about && <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">{s.about}</p>}
      {how && (
        <div className="mt-2 space-y-1.5 border-l rule pl-3 text-[13px] leading-relaxed text-[var(--muted)]">
          <p>Fetched live from <a href={s.url} target="_blank" rel="noreferrer" className="link text-[var(--ink)]">screener.in</a> ({s.variant} figures){s.fetched_at ? ` at ${when(s.fetched_at)}` : ""}.{s.name?.includes("(searched") ? ` ${s.name.match(/\(searched.*\)/)?.[0].replace(/[()]/g, "")}; resolved via screener search.` : ""}</p>
          <p>QoQ, YoY and margins were computed in code from the table. EBITDA is screener’s operating profit.</p>
        </div>
      )}
    </div>
  );
}
