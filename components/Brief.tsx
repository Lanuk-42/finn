"use client";

import { useMemo, useState } from "react";
import type { Brief as BriefT, Filing, MgmtCard, ResultsCard, Stock } from "@/lib/types";
import { CATEGORY_LABEL, cleanTitle, day, fyq, opSym, pct, pp, tone, when } from "@/lib/format";

const WINDOWS = [
  { d: 1, label: "24h" },
  { d: 3, label: "3d" },
  { d: 7, label: "7d" },
  { d: 30, label: "30d" },
];

export default function Brief({ brief, onOpenStock }: { brief: BriefT; onOpenStock: (s: string) => void }) {
  const [win, setWin] = useState(7);
  const [px, setPx] = useState(5);
  const [vx, setVx] = useState(2);
  const [showRoutine, setShowRoutine] = useState(false);

  const asOf = new Date(brief.data_as_of).getTime();
  const byId = useMemo(() => Object.fromEntries(brief.filings.map((f) => [f.id, f])), [brief.filings]);
  const stock = useMemo(() => Object.fromEntries(brief.stocks.map((s) => [s.symbol, s])), [brief.stocks]);

  const inWin = (ts: string) => asOf - new Date(ts.length === 10 ? ts + "T15:30:00+05:30" : ts).getTime() <= win * 86400e3;
  const filings = brief.filings.filter((f) => inWin(f.ts));
  const act = filings
    .filter((f) => f.tier === "Act")
    .sort((a, b) => {
      const ia = brief.act_order.indexOf(a.category), ib = brief.act_order.indexOf(b.category);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.ts.localeCompare(a.ts);
    });
  // Collapse repeated updates on the same matter (e.g. six CIRP hearing updates) into one card.
  const actGroups: { lead: Filing; earlier: Filing[] }[] = [];
  for (const f of [...act].sort((a, b) => b.ts.localeCompare(a.ts))) {
    const g = actGroups.find((x) => x.lead.symbol === f.symbol && x.lead.category === f.category && x.lead.category !== "results" && x.lead.rule === f.rule && cleanTitle(x.lead.title) === cleanTitle(f.title));
    if (g) g.earlier.push(f); else actGroups.push({ lead: f, earlier: [] });
  }
  actGroups.sort((a, b) => {
    const ia = brief.act_order.indexOf(a.lead.category), ib = brief.act_order.indexOf(b.lead.category);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.lead.ts.localeCompare(a.lead.ts);
  });
  const note = filings.filter((f) => f.tier === "Note");
  const routine = filings.filter((f) => f.tier === "Routine");
  const breaches = brief.stocks.filter((s) => s.thesis.status === "breach");

  const moves = Object.entries(brief.moves)
    .flatMap(([sym, rows]) => rows.filter((r) => inWin(r.date) && (Math.abs(r.pct) >= px || (r.volx ?? 0) >= vx)).map((r) => ({ sym, ...r })))
    .sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.pct) - Math.abs(a.pct));

  return (
    <div className="px-4">
      <header className="sticky top-0 z-20 -mx-4 border-b hairline bg-[var(--bg)]/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)] backdrop-blur">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">FINN</h1>
          <span className="text-[12px] text-[var(--muted)]">{brief.stocks.length} holdings</span>
        </div>
        <p className="num mt-1 text-[14px] leading-snug text-[var(--muted)]">
          As of <span className="text-[var(--ink)]">{when(brief.data_as_of)}</span>,{" "}
          <span className="text-[var(--ink)]">{filings.length}</span> filings checked,{" "}
          <span className={act.length ? "font-semibold text-[var(--act)]" : "text-[var(--ink)]"}>{act.length}</span> need your attention
        </p>
        <div className="mt-3 flex gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w.d}
              onClick={() => setWin(w.d)}
              className={`num rounded-full px-3 py-1 text-[13px] font-medium ${win === w.d ? "bg-[var(--ink)] text-[var(--bg)]" : "chip text-[var(--muted)]"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      {breaches.length > 0 && (
        <section className="mt-4 space-y-2">
          {breaches.map((s) => <BreachBanner key={s.symbol} s={s} onOpen={() => onOpenStock(s.symbol)} />)}
        </section>
      )}

      <Section title="Act" count={act.length} tone="act" hint="Material: results, management, legal, deals, equity raises">
        {act.length === 0 && <Empty>Nothing material in this window.</Empty>}
        {actGroups.map((g) => <FilingCard key={g.lead.id} f={g.lead} earlier={g.earlier} onOpenStock={onOpenStock} />)}
      </Section>

      <Section title="Moves" count={moves.length} tone="ink" hint="End-of-day price or volume beyond your thresholds">
        <Thresholds px={px} vx={vx} setPx={setPx} setVx={setVx} />
        {moves.length === 0 && <Empty>No stock crossed ±{px}% or {vx.toFixed(1)}× volume.</Empty>}
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {moves.map((m) => (
            <MoveRow key={m.sym + m.date} m={m} order={brief.act_order} linked={m.filings.map((id) => byId[id]).filter(Boolean)} name={stock[m.sym]?.name} px={px} vx={vx} onOpen={() => onOpenStock(m.sym)} />
          ))}
        </div>
      </Section>

      <Section title="Note" count={note.length} tone="note" hint="Worth a glance: transcripts, ratings, orders, dividends">
        {note.length === 0 && <Empty>Nothing to note.</Empty>}
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {note.map((f) => <CompactRow key={f.id} f={f} onOpenStock={onOpenStock} />)}
        </div>
      </Section>

      <section className="mt-6">
        <button onClick={() => setShowRoutine((v) => !v)} className="flex w-full items-center justify-between py-2 text-left">
          <span className="text-[13px] font-medium text-[var(--muted)]">
            {routine.length} routine filings hidden
            <span className="ml-1 text-[var(--faint)]">· investor meets, ad copies, compliance certificates</span>
          </span>
          <span className="text-[13px] text-[var(--muted)]">{showRoutine ? "Hide" : "Show"}</span>
        </button>
        {showRoutine && (
          <div className="card divide-y divide-[var(--line)] overflow-hidden opacity-80">
            {routine.map((f) => <CompactRow key={f.id} f={f} onOpenStock={onOpenStock} />)}
          </div>
        )}
      </section>

      <footer className="mt-8 space-y-1 pb-4 text-[11px] leading-relaxed text-[var(--faint)]">
        <p>Filings: BSE corporate announcements (NSE API blocks cloud IPs; BSE is the fallback). Prices: Yahoo Finance EOD, last session {day(brief.latest_trading_day)}. Results numbers: screener.in quarterly tables.</p>
        <p>Tiers are decided by rules in code, not by a model. Every number is computed from the tables; every quote is checked against the filing text.</p>
      </footer>
    </div>
  );
}

function Section({ title, count, tone, hint, children }: { title: string; count: number; tone: "act" | "note" | "ink"; hint: string; children: React.ReactNode }) {
  const color = tone === "act" ? "text-[var(--act)]" : tone === "note" ? "text-[var(--note)]" : "text-[var(--ink)]";
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className={`text-[15px] font-semibold ${color}`}>{title}</h2>
        <span className="num text-[13px] text-[var(--faint)]">{count}</span>
        <span className="ml-auto truncate text-[11px] text-[var(--faint)]">{hint}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed hairline px-3 py-3 text-[13px] text-[var(--muted)]">{children}</p>;
}

function BreachBanner({ s, onOpen }: { s: Stock; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full rounded-2xl border border-[var(--down)]/30 bg-[var(--act-bg)] px-4 py-3 text-left">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--down)]">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--down)]" /> Thesis breach · {s.symbol}
      </div>
      <p className="num mt-1 text-[15px] font-medium leading-snug">
        {s.thesis.rule.split(/ [<>]=/)[0]} is <span className="text-[var(--down)]">{s.thesis.actual}%</span> in {fyq(s.thesis.quarter)}; your line is {opSym(s.thesis.op)} {s.thesis.value}%.
      </p>
      <p className="mt-0.5 text-[13px] text-[var(--muted)]">Why you own it: {s.thesis.why}</p>
    </button>
  );
}

function Thresholds({ px, vx, setPx, setVx }: { px: number; vx: number; setPx: (n: number) => void; setVx: (n: number) => void }) {
  return (
    <div className="card grid grid-cols-2 gap-4 px-4 py-3">
      <label className="block">
        <span className="flex justify-between text-[12px] text-[var(--muted)]">Price move <b className="num text-[var(--ink)]">±{px}%</b></span>
        <input type="range" min={1} max={15} step={0.5} value={px} onChange={(e) => setPx(Number(e.target.value))} className="mt-2 w-full" aria-label="Price move threshold" />
      </label>
      <label className="block">
        <span className="flex justify-between text-[12px] text-[var(--muted)]">Volume <b className="num text-[var(--ink)]">{vx.toFixed(1)}×</b></span>
        <input type="range" min={1.2} max={6} step={0.1} value={vx} onChange={(e) => setVx(Number(e.target.value))} className="mt-2 w-full" aria-label="Volume threshold" />
        <span className="text-[10px] text-[var(--faint)]">vs prior 20-day average</span>
      </label>
    </div>
  );
}

function MoveRow({ m, linked, order, name, px, vx, onOpen }: {
  m: { sym: string; date: string; pct: number; volx: number | null; explained: boolean }; linked: Filing[]; order: string[]; name?: string; px: number; vx: number; onOpen: () => void;
}) {
  const rank = (f: Filing) => ({ Act: 0, Note: 1, Routine: 2 })[f.tier] * 100 + (order.indexOf(f.category) < 0 ? 50 : order.indexOf(f.category));
  const material = linked.filter((f) => f.tier !== "Routine").sort((a, b) => rank(a) - rank(b));
  const reason = material[0];
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline gap-2">
        <button onClick={onOpen} className="text-[14px] font-semibold">{m.sym}</button>
        <span className="truncate text-[12px] text-[var(--faint)]">{name}</span>
        <span className="num ml-auto text-[12px] text-[var(--muted)]">{day(m.date)}</span>
      </div>
      <div className="num mt-0.5 flex gap-3 text-[13px]">
        <span className={`${tone(m.pct)} ${Math.abs(m.pct) >= px ? "font-semibold" : ""}`}>{pct(m.pct)}</span>
        <span className={(m.volx ?? 0) >= vx ? "font-semibold" : "text-[var(--muted)]"}>{m.volx?.toFixed(1)}× vol</span>
      </div>
      {reason ? (
        <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">
          <span className="text-[var(--ink)]">Filed {day(reason.ts)}:</span> {shortTitle(reason)}
          {material.length > 1 && <span className="text-[var(--faint)]"> · +{material.length - 1} more</span>}
        </p>
      ) : (
        <p className="mt-1 inline-block rounded-md bg-[var(--warn-bg)] px-2 py-0.5 text-[12px] font-medium text-[var(--warn)]">
          {linked.length ? "Only routine paperwork filed: move unexplained" : "No filing found"}
        </p>
      )}
    </div>
  );
}

function shortTitle(f: Filing): string {
  if (f.card?.type === "results") return `${fyq(f.card.quarter)} results`;
  const t = cleanTitle(f.title);
  return `${CATEGORY_LABEL[f.category] ?? f.category} · ${t.length > 70 ? t.slice(0, 68) + "…" : t}`;
}

/** One-line read of a results card, computed from the numbers (no model). */
function resultsRead(c: ResultsCard): string | null {
  const r = c.lines?.revenue?.yoy, p = c.lines?.pat?.yoy;
  if (r == null || p == null) return null;
  const m = c.ebitda_margin?.yoy_pp;
  const mtxt = m != null && Math.abs(m) >= 0.5 ? `; EBITDA margin ${m > 0 ? "up" : "down"} ${Math.abs(m).toFixed(1)}pp` : "";
  if (r >= 0 && p < 0) return `Revenue up ${r.toFixed(0)}% YoY but PAT down ${Math.abs(p).toFixed(0)}%${mtxt}`;
  if (r < 0 && p >= 0) return `PAT up ${p.toFixed(0)}% YoY despite revenue down ${Math.abs(r).toFixed(0)}%${mtxt}`;
  return `Revenue ${pct(r, 0)} YoY, PAT ${pct(p, 0)}${mtxt}`;
}

function CompactRow({ f, onOpenStock }: { f: Filing; onOpenStock: (s: string) => void }) {
  const head = f.headline && f.headline.toLowerCase() !== f.title.toLowerCase() && !/^(disclosure|announcement|intimation) under/i.test(f.headline) ? f.headline : "";
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-baseline gap-2 text-[12px]">
        <button onClick={() => onOpenStock(f.symbol)} className="font-semibold text-[var(--ink)]">{f.symbol}</button>
        <span className="text-[var(--faint)]">{CATEGORY_LABEL[f.category] ?? f.category}</span>
        <span className="num ml-auto text-[var(--faint)]">{when(f.ts)}</span>
      </div>
      <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="clamp-2 mt-0.5 block text-[14px] leading-snug">
        {head || cleanTitle(f.title)}
      </a>
    </div>
  );
}

function FilingCard({ f, earlier = [], onOpenStock }: { f: Filing; earlier?: Filing[]; onOpenStock: (s: string) => void }) {
  const [showEarlier, setShowEarlier] = useState(false);
  const isResults = f.card?.type === "results" && f.card.status === "ok";
  const head = f.headline && f.headline.toLowerCase() !== f.title.toLowerCase() && !/^(disclosure|announcement|intimation) under/i.test(f.headline) ? f.headline : "";
  return (
    <article className="card overflow-hidden">
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 text-[12px]">
          <button onClick={() => onOpenStock(f.symbol)} className="rounded-md bg-[var(--ink)] px-1.5 py-0.5 font-semibold text-[var(--bg)]">{f.symbol}</button>
          <span className="font-medium text-[var(--act)]">{CATEGORY_LABEL[f.category] ?? f.category}</span>
          <span className="num ml-auto text-[var(--faint)]">{when(f.ts)}</span>
        </div>
        <h3 className="mt-2 text-[15px] font-medium leading-snug">
          {f.card?.type === "results" ? `${fyq(f.card.quarter)} results` : cleanTitle(f.title)}
        </h3>
        {isResults && resultsRead(f.card as ResultsCard) && <p className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">{resultsRead(f.card as ResultsCard)}</p>}
        {head && !f.card && <p className="clamp-2 mt-1 text-[13px] leading-snug text-[var(--muted)]">{head}</p>}
        {earlier.length > 0 && (
          <button onClick={() => setShowEarlier((v) => !v)} className="mt-1.5 text-[12px] font-medium text-[var(--muted)] underline decoration-[var(--line)] underline-offset-2">
            {showEarlier ? "Hide" : `+${earlier.length} earlier update${earlier.length > 1 ? "s" : ""} on this`}
          </button>
        )}
        {showEarlier && (
          <ul className="mt-1.5 space-y-1 border-l-2 hairline pl-3">
            {earlier.map((e) => (
              <li key={e.id} className="text-[12px] leading-snug text-[var(--muted)]">
                <span className="num text-[var(--faint)]">{when(e.ts)}</span> · <a href={e.url ?? undefined} target="_blank" rel="noreferrer" className="underline decoration-[var(--line)] underline-offset-2">{e.headline || cleanTitle(e.title)}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {f.card?.type === "results" && <ResultsBody c={f.card} />}
      {f.card?.type === "management" && <MgmtBody c={f.card} headline={head} />}
      <div className="mt-3 flex items-center gap-3 border-t hairline px-4 py-2 text-[12px]">
        {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--ink)] underline decoration-[var(--line)] underline-offset-2">Filing PDF</a>}
        {f.card?.type === "results" && f.card.raw_pdf && <a href={f.card.raw_pdf} target="_blank" rel="noreferrer" className="text-[var(--muted)] underline decoration-[var(--line)] underline-offset-2">Table source</a>}
        <span className="ml-auto truncate font-mono text-[10px] text-[var(--faint)]">rule: {f.rule} · {f.basis}</span>
      </div>
    </article>
  );
}

function ResultsBody({ c }: { c: ResultsCard }) {
  if (c.status !== "ok" || !c.lines) {
    return <p className="mx-4 mt-2 rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-[13px] text-[var(--warn)]">{c.note}</p>;
  }
  const rows: [string, keyof NonNullable<ResultsCard["lines"]>][] = [["Revenue", "revenue"], ["EBITDA", "ebitda"], ["PBT", "pbt"], ["PAT", "pat"]];
  return (
    <div className="mt-3 px-4">
      <div className="num grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-4 gap-y-1.5 text-[13px]">
        <span className="text-[11px] uppercase tracking-wide text-[var(--faint)]">{c.quarter}</span>
        <span className="text-right text-[11px] uppercase tracking-wide text-[var(--faint)]">₹ Cr</span>
        <span className="text-right text-[11px] uppercase tracking-wide text-[var(--faint)]">QoQ</span>
        <span className="text-right text-[11px] uppercase tracking-wide text-[var(--faint)]">YoY</span>
        {rows.map(([label, k]) => {
          const l = c.lines![k];
          return (
            <Fragment4 key={k}>
              <span className="text-[var(--muted)]">{label}</span>
              <span className="text-right font-medium">{l ? l.value?.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}</span>
              <span className={`text-right ${tone(l?.qoq)}`}>{l ? pct(l.qoq) : c.is_bank && k === "ebitda" ? "n/a" : "—"}</span>
              <span className={`text-right ${tone(l?.yoy)}`}>{l ? pct(l.yoy) : c.is_bank && k === "ebitda" ? "bank" : "—"}</span>
            </Fragment4>
          );
        })}
      </div>
      {c.ebitda_margin && (
        <p className="num mt-2 text-[12px] text-[var(--muted)]">
          EBITDA margin <b className="text-[var(--ink)]">{c.ebitda_margin.value}%</b>
          <span className={`ml-2 ${tone(c.ebitda_margin.qoq_pp)}`}>{pp(c.ebitda_margin.qoq_pp)} QoQ</span>
          <span className={`ml-2 ${tone(c.ebitda_margin.yoy_pp)}`}>{pp(c.ebitda_margin.yoy_pp)} YoY</span>
        </p>
      )}
      {c.is_bank && <p className="mt-1 text-[11px] text-[var(--faint)]">Banks report no EBITDA line; revenue is total interest + other income.</p>}
    </div>
  );
}

function Fragment4({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function MgmtBody({ c, headline }: { c: MgmtCard; headline: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!c.people.length) {
    return <p className="mx-4 mt-1 text-[13px] leading-snug text-[var(--muted)]">{headline || c.note || "Names could not be verified in the filing text: open the PDF."}</p>;
  }
  const badge = { joined: "bg-[var(--up)]/15 text-[var(--up)]", left: "bg-[var(--down)]/15 text-[var(--down)]", reappointed: "chip text-[var(--muted)]", redesignated: "chip text-[var(--muted)]" };
  return (
    <ul className="mt-2 space-y-2.5 px-4">
      {c.people.map((p, i) => (
        <li key={i} className="rounded-xl bg-[var(--bg)] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge[p.change]}`}>{p.change}</span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight">{p.name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.|Shri)\s*/i, "")}</p>
              <p className="text-[12px] leading-snug text-[var(--muted)]">{p.role}</p>
            </div>
          </div>
          {p.change === "left" && p.tenure && <p className="mt-1.5 text-[12px] leading-snug text-[var(--muted)]">Tenure: “{p.tenure}”</p>}
          {p.bio && <p className="clamp-2 mt-1.5 text-[13px] leading-snug">{p.bio}</p>}
          {p.change !== "left" && !p.bio && <p className="mt-1.5 text-[12px] text-[var(--faint)]">No background given in the filing.</p>}
          <button onClick={() => setOpen(open === i ? null : i)} className="mt-1.5 text-[11px] font-medium text-[var(--muted)] underline decoration-[var(--line)] underline-offset-2">
            {open === i ? "Hide source" : "Source quote ✓ verified"}
          </button>
          {open === i && <blockquote className="mt-1 border-l-2 hairline pl-2 text-[12px] italic leading-snug text-[var(--muted)]">“{p.evidence}”</blockquote>}
        </li>
      ))}
    </ul>
  );
}
