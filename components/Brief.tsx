"use client";

import { useMemo, useState } from "react";
import type { Brief as BriefT, Filing, Line, MgmtCard, MoveRow, PromiseFile, ResultsCard } from "@/lib/types";
import { CATEGORY_LABEL, cleanTitle, day, fyq, IST, when } from "@/lib/format";
import { useDeviceState } from "@/lib/device";
import ThesisEditor, { checkThesis, type ThesisLine } from "./ThesisEditor";
import { breachLead, cleanName, filingLead, fillName, isBoiler, moveLead, noteText, promiseLink, sentenceCase, shortName, tidy, tidyProse, tidyRole } from "@/lib/lead";

const WINDOWS = [
  { d: 1, label: "24h", phrase: "today", span: "the last 24 hours" },
  { d: 3, label: "3d", phrase: "this week", span: "the last 3 days" },
  { d: 7, label: "7d", phrase: "this week", span: "the last 7 days" },
  { d: 30, label: "30d", phrase: "this month", span: "the last 30 days" },
];
const MIN_ACT = 3; // default window = the smallest one with at least this many Act items

const tsMs = (ts: string) => new Date(ts.length === 10 ? ts + "T15:30:00+05:30" : ts).getTime();

/** Act filings in a window, with repeated updates on the same matter (e.g. six CIRP hearings) collapsed into one item. */
function actGroupsFor(brief: BriefT, asOf: number, days: number) {
  const rank = (c: string) => { const i = brief.act_order.indexOf(c); return i < 0 ? 99 : i; };
  const act = brief.filings.filter((f) => f.tier === "Act" && asOf - tsMs(f.ts) <= days * 86400e3);
  const groups: { lead: Filing; earlier: Filing[] }[] = [];
  for (const f of [...act].sort((a, b) => b.ts.localeCompare(a.ts))) {
    const g = groups.find((x) => x.lead.symbol === f.symbol && x.lead.category === f.category && x.lead.category !== "results" && x.lead.rule === f.rule && cleanTitle(x.lead.title) === cleanTitle(f.title));
    if (g) g.earlier.push(f); else groups.push({ lead: f, earlier: [] });
  }
  return groups.sort((a, b) => rank(a.lead.category) - rank(b.lead.category) || b.lead.ts.localeCompare(a.lead.ts));
}

/** A change "matters" if it is a real decline (accent) or a large move (weight). Everything else stays quiet. */
function sig(n: number | null | undefined, kind: "pct" | "pp" = "pct") {
  if (n == null) return "text-[var(--faint)]";
  if (kind === "pct" ? n <= -5 : n <= -1) return "text-[var(--accent)] font-semibold";
  if (kind === "pct" ? n >= 15 : n >= 1) return "text-[var(--ink)] font-semibold";
  return "text-[var(--ink-2)]";
}
const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`);
const fmtPp = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}pp`);

export default function Brief({ brief, promises, onOpenStock }: { brief: BriefT; promises: PromiseFile[]; onOpenStock: (s: string) => void }) {
  const asOf = new Date(brief.data_as_of).getTime();
  const autoWin = useMemo(
    () => WINDOWS.find((w) => actGroupsFor(brief, asOf, w.d).length >= MIN_ACT)?.d ?? WINDOWS[WINDOWS.length - 1].d,
    [brief, asOf],
  );
  const [win, setWin] = useState(autoWin);
  const [px, setPx] = useState(5);
  const [vx, setVx] = useState(2);
  const [adjust, setAdjust] = useState(false);
  const [showRoutine, setShowRoutine] = useState(false);
  const [allBreaches, setAllBreaches] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [doneIds, setDoneIds] = useDeviceState<string[]>("finn.done.v1", []);
  const [showDone, setShowDone] = useState(false);

  const byId = useMemo(() => Object.fromEntries(brief.filings.map((f) => [f.id, f])), [brief.filings]);
  const stock = useMemo(() => Object.fromEntries(brief.stocks.map((s) => [s.symbol, s])), [brief.stocks]);
  const nm = (sym: string) => shortName(sym, stock[sym]?.name);

  const W = WINDOWS.find((w) => w.d === win)!;
  const inWin = (ts: string) => asOf - tsMs(ts) <= win * 86400e3;
  const filings = brief.filings.filter((f) => inWin(f.ts));
  const actGroups = useMemo(() => actGroupsFor(brief, asOf, win), [brief, asOf, win]);
  const note = filings.filter((f) => f.tier === "Note");
  const routine = filings.filter((f) => f.tier === "Routine");
  // Thesis lines: defaults from the pipeline, overridden per device; re-checked here instantly.
  const [overrides, setOverrides] = useDeviceState<Record<string, ThesisLine>>("finn.thesis.v1", {});
  const [editing, setEditing] = useState(false);
  const lineFor = (st: (typeof brief.stocks)[number]): ThesisLine => overrides[st.symbol] ?? { why: st.thesis.why, metric: st.thesis.metric, op: st.thesis.op, value: st.thesis.value };
  const theses = brief.stocks.map((st) => {
    const l = lineFor(st);
    return { ...st, thesis: Number.isFinite(l.value) ? checkThesis(st, l) : { ...st.thesis, ...l, status: "n/a" as const } };
  });
  const breaches = theses.filter((s) => s.thesis.status === "breach");

  const rowsInWin = Object.entries(brief.moves).flatMap(([sym, rows]) => rows.filter((r) => inWin(r.date)).map((r) => ({ sym, ...r })));
  const moves = rowsInWin
    .filter((r) => Math.abs(r.pct) >= px || (r.volx ?? 0) >= vx)
    .sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.pct) - Math.abs(a.pct));

  // For useful empty states: the last material event before this window, and the biggest move inside it.
  const lastAct = brief.filings.filter((f) => f.tier === "Act" && !inWin(f.ts)).sort((a, b) => b.ts.localeCompare(a.ts))[0];
  // No session inside the window (e.g. a weekend)? Fall back to the last trading session.
  const pool = rowsInWin.length ? rowsInWin
    : Object.entries(brief.moves).flatMap(([sym, rows]) => rows.filter((r) => r.date === brief.latest_trading_day).map((r) => ({ sym, ...r })));
  const biggest = [...pool].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  const total = actGroups.length;
  const doneSet = new Set(doneIds);
  const open = actGroups.filter((g) => !doneSet.has(g.lead.id));
  const handled = actGroups.filter((g) => doneSet.has(g.lead.id));
  const n = open.length;
  const toggleDone = (id: string) => setDoneIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="px-5">
      {/* Masthead */}
      <header className="pt-[max(env(safe-area-inset-top),18px)]">
        <div className="flex items-baseline justify-between border-b-2 border-[var(--rule-strong)] pb-2">
          <span className="serif text-[17px] font-bold tracking-[0.02em]">FINN</span>
          <span className="label">Morning note · {new Date(brief.data_as_of).toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" })}</span>
        </div>
        <h1 className="serif mt-5 text-[32px] font-semibold leading-[1.1] tracking-[-0.01em]">
          {total > 0 && n === 0 ? <>You’re clear {W.phrase}</>
            : n === 0 ? <>Nothing needs you {W.phrase}</>
            : <><span className="num">{n}</span> {n === 1 ? "thing needs" : "things need"} you {W.phrase}</>}
        </h1>
        <p className="num mt-2 text-[14px] text-[var(--muted)]">
          {handled.length > 0 && <>{handled.length} of {total} done · </>}from {filings.length} filings across {brief.stocks.length} holdings · {when(brief.data_as_of)} IST
        </p>
        <nav aria-label="Time window" className="mt-4 flex gap-6 border-b rule">
          {WINDOWS.map((w) => (
            <button key={w.d} onClick={() => setWin(w.d)} aria-pressed={win === w.d}
              className={`num -mb-px border-b-2 pb-2 text-[14px] ${win === w.d ? "border-[var(--ink)] font-semibold text-[var(--ink)]" : "border-transparent text-[var(--faint)]"}`}>
              {w.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Thesis */}
      <Section label="Off thesis" right={
        <span className="num text-[12px] text-[var(--muted)]">
          {breaches.length ? `${breaches.length} of ${brief.stocks.length} · ` : ""}<button onClick={() => setEditing(true)} className="link text-[var(--ink)]">Edit lines</button>
        </span>
      }>
        {breaches.length === 0 && <Empty>All {brief.stocks.length} holdings are on thesis.</Empty>}
        {(allBreaches ? breaches : breaches.slice(0, 3)).map((s) => (
          <Item key={s.symbol}>
            <button onClick={() => onOpenStock(s.symbol)} className="block w-full text-left">
              <p className="serif text-[17px] leading-snug">
                <span className="text-[var(--accent)]">{breachLead(nm(s.symbol), s)}</span>
              </p>
              <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">You own it because: {s.thesis.why.charAt(0).toLowerCase() + s.thesis.why.slice(1)}.</p>
            </button>
          </Item>
        ))}
        {breaches.length > 3 && (
          <More onClick={() => setAllBreaches((v) => !v)}>{allBreaches ? "Show fewer" : `${breaches.length - 3} more off thesis`}</More>
        )}
      </Section>

      {/* Patterns from filing history: only flags here; Research shows every pattern for a company */}
      {(brief.patterns ?? []).some((p) => p.severity === "flag") && (
        <Section label="Patterns" right={String((brief.patterns ?? []).filter((p) => p.severity === "flag").length)}>
          {(brief.patterns ?? []).filter((p) => p.severity === "flag").map((p) => (
            <Item key={p.symbol + p.kind}>
              <div className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.08em]">
                <button onClick={() => onOpenStock(p.symbol)} className="font-semibold text-[var(--ink)]">{p.symbol}</button>
                <span className="text-[var(--muted)]">{p.kind === "credit" ? "Credit rating" : p.kind === "exits" ? "Senior exits" : "Promoter pledges"}</span>
              </div>
              <p className="serif mt-1.5 text-[17px] leading-snug">{fillName(p.lead, nm(p.symbol))}</p>
            </Item>
          ))}
        </Section>
      )}

      {editing && (
        <ThesisEditor
          stocks={brief.stocks}
          lines={Object.fromEntries(brief.stocks.map((st) => [st.symbol, lineFor(st)]))}
          onChange={(sym, l) => setOverrides((o) => ({ ...o, [sym]: l }))}
          onReset={(sym) => setOverrides((o) => { const n = { ...o }; delete n[sym]; return n; })}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Act */}
      <Section label="Act on" right={total ? (handled.length ? `${n} open · ${handled.length} done` : String(n)) : undefined}>
        {total > 0 && n === 0 && (
          <div className="border-b rule py-5">
            <p className="serif text-[22px] font-semibold leading-tight">Inbox zero.</p>
            <p className="serif mt-1 text-[16px] leading-snug text-[var(--ink-2)]">
              {total === 1 ? `The one item from ${W.span} is handled.` : `All ${total} items from ${W.span} are handled.`} New filings will land here as they come in.
            </p>
          </div>
        )}
        {total === 0 && (
          <Empty>
            Quiet {W.phrase === "today" ? "day" : W.phrase.replace("this ", "")}.{" "}
            {lastAct ? <>Last material event: {lastEventText(nm(lastAct.symbol), lastAct)}, {day(lastAct.ts)}.</> : "Nothing material in 30 days."}
          </Empty>
        )}
        {open.map((g) => <ActItem key={g.lead.id} f={g.lead} earlier={g.earlier} name={nm(g.lead.symbol)} pf={promises.find((p) => p.symbol === g.lead.symbol)} onOpenStock={onOpenStock} onDone={() => toggleDone(g.lead.id)} />)}
        {handled.length > 0 && (
          <div className="pt-3">
            <button onClick={() => setShowDone((v) => !v)} className="link text-[13px] text-[var(--muted)]">
              {showDone ? "Hide done" : `${handled.length} done`}
            </button>
            {showDone && (
              <ul className="mt-1">
                {handled.map((g) => (
                  <li key={g.lead.id} className="flex items-baseline gap-3 border-b rule py-2.5 text-[14px] text-[var(--muted)]">
                    <span className="flex-1 leading-snug line-through decoration-[var(--faint)]">{filingLead(nm(g.lead.symbol), g.lead)}</span>
                    <button onClick={() => toggleDone(g.lead.id)} className="link shrink-0 text-[13px] text-[var(--ink)]">Undo</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      {/* Moves */}
      <Section
        label="Moves"
        right={
          <button onClick={() => setAdjust((v) => !v)} className="num text-[12px] text-[var(--muted)]">
            ±{px}% · {vx.toFixed(1)}× vol · <span className="link text-[var(--ink)]">{adjust ? "Done" : "Adjust"}</span>
          </button>
        }
      >
        {adjust && (
          <div className="grid grid-cols-2 gap-5 border-b rule py-3">
            <label className="block text-[12px] text-[var(--muted)]">
              Price move <b className="num float-right text-[var(--ink)]">±{px}%</b>
              <input type="range" min={1} max={15} step={0.5} value={px} onChange={(e) => setPx(Number(e.target.value))} className="mt-2 w-full" aria-label="Price move threshold" />
            </label>
            <label className="block text-[12px] text-[var(--muted)]">
              Volume vs 20-day avg <b className="num float-right text-[var(--ink)]">{vx.toFixed(1)}×</b>
              <input type="range" min={1.2} max={6} step={0.1} value={vx} onChange={(e) => setVx(Number(e.target.value))} className="mt-2 w-full" aria-label="Volume threshold" />
            </label>
          </div>
        )}
        {moves.length === 0 && (
          <Empty>
            No holding moved ±{px}% or traded {vx.toFixed(1)}× its usual volume.
            {biggest && <> {rowsInWin.length ? "Biggest move" : `Last session (${day(biggest.date)}), biggest move`}: {nm(biggest.sym)} {fmtPct(biggest.pct)}{rowsInWin.length ? ` on ${day(biggest.date)}` : ""}.</>}
          </Empty>
        )}
        {moves.map((m) => {
          const linked = m.filings.map((id) => byId[id]).filter(Boolean) as Filing[];
          const rank = (f: Filing) => ({ Act: 0, Note: 1, Routine: 2 })[f.tier] * 100 + (brief.act_order.indexOf(f.category) < 0 ? 50 : brief.act_order.indexOf(f.category));
          const material = linked.filter((f) => f.tier !== "Routine").sort((a, b) => rank(a) - rank(b));
          return <MoveItem key={m.sym + m.date} m={m} sym={m.sym} name={nm(m.sym)} reason={material[0]} linkedCount={linked.length} px={px} vx={vx} onOpen={() => onOpenStock(m.sym)} />;
        })}
      </Section>

      {/* Note */}
      <Section label="Worth a look" right={note.length ? String(note.length) : undefined}>
        {note.length === 0 && <Empty>Nothing else worth a look in {W.span}.</Empty>}
        {note.map((f) => <CompactItem key={f.id} f={f} name={nm(f.symbol)} onOpenStock={onOpenStock} />)}
      </Section>

      {/* Routine */}
      {routine.length > 0 && <div className="mt-8 border-t rule pt-3">
        <button onClick={() => setShowRoutine((v) => !v)} className="flex w-full items-baseline justify-between text-left text-[14px] text-[var(--muted)]">
          <span><span className="num text-[var(--ink)]">{routine.length}</span> routine filings set aside</span>
          <span className="link text-[13px]">{showRoutine ? "Hide" : "Show"}</span>
        </button>
        {showRoutine && <div className="mt-1 opacity-80">{routine.map((f) => <CompactItem key={f.id} f={f} name={nm(f.symbol)} onOpenStock={onOpenStock} />)}</div>}
      </div>}

      {/* Method */}
      <div className="mt-6 border-t rule pb-6 pt-3">
        <button onClick={() => setHowOpen((v) => !v)} className="link text-[13px] text-[var(--muted)]">How FINN checked this</button>
        {howOpen && (
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-[var(--muted)]">
            <li>Window: {W.span}.{win === autoWin && ` Picked automatically as the shortest window with at least ${MIN_ACT} items to act on.`}</li>
            <li>Filings come from BSE corporate announcements; NSE’s API blocks cloud servers, so BSE is the fallback. Prices are Yahoo Finance end-of-day, last session {day(brief.latest_trading_day)}. Results numbers come from screener.in quarterly tables.</li>
            <li>Act, Worth a look and Routine are decided by fixed rules in code, not by a model. Every number is computed from the tables; every quoted name, tenure and bio was checked word-for-word against the filing.</li>
            <li>A move counts when the close changes by at least ±{px}% or volume is {vx.toFixed(1)}× its prior 20-day average. It is linked to filings from the same day or since the previous session; routine paperwork does not count as an explanation.</li>
            <li>Thesis lines are checked against the latest reported quarter.</li>
          </ul>
        )}
      </div>
    </div>
  );
}

function lastEventText(name: string, f: Filing) {
  if (f.card?.type === "results") return `${name} ${fyq(f.card.quarter)} results`;
  return `${name} ${(CATEGORY_LABEL[f.category] ?? f.category).toLowerCase()} filing`;
}

// ---------------------------------------------------------------- layout primitives
function Section({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between border-b border-[var(--rule-strong)] pb-1.5">
        <h2 className="label !text-[var(--ink)]">{label}</h2>
        {typeof right === "string" ? <span className="num text-[12px] text-[var(--muted)]">{right}</span> : right}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return <article className="border-b rule py-4">{children}</article>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="serif border-b rule py-4 text-[16px] leading-snug text-[var(--ink-2)]">{children}</p>;
}

function More({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="link py-3 text-[13px] text-[var(--muted)]">{children}</button>;
}

function Meta({ sym, kind, ts, onOpen }: { sym: string; kind?: string; ts: string; onOpen: () => void }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.08em]">
      <button onClick={onOpen} className="font-semibold text-[var(--ink)]">{sym}</button>
      {kind && <span className="text-[var(--muted)]">{kind}</span>}
      <span className="num ml-auto normal-case tracking-normal text-[12px] text-[var(--faint)]">{when(ts)}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Act
function ActItem({ f, earlier, name, pf, onOpenStock, onDone }: { f: Filing; earlier: Filing[]; name: string; pf?: PromiseFile; onOpenStock: (s: string) => void; onDone: () => void }) {
  const [how, setHow] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const results = f.card?.type === "results" ? f.card : null;
  const mgmt = f.card?.type === "management" ? f.card : null;
  return (
    <Item>
      <Meta sym={f.symbol} kind={results ? `${fyq(results.quarter)} results` : CATEGORY_LABEL[f.category] ?? f.category} ts={f.ts} onOpen={() => onOpenStock(f.symbol)} />
      <p className="serif mt-1.5 text-[19px] font-medium leading-[1.3]">{filingLead(name, f)}</p>

      {results?.status === "ok" && <ResultsTable c={results} />}
      {results && (() => {
        const link = promiseLink(results, pf);
        return link && (
          <button onClick={() => onOpenStock(f.symbol)} className="mt-2.5 flex w-full items-baseline gap-2 border-t rule pt-2 text-left">
            <span className="label shrink-0 !text-[10px]">Promise</span>
            <span className={`num flex-1 text-[14px] leading-snug ${link.bad ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>{link.text}</span>
            <span className="text-[13px] text-[var(--muted)]">→</span>
          </button>
        );
      })()}
      {mgmt && mgmt.people.length > 0 && <People c={mgmt} />}

      {earlier.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowEarlier((v) => !v)} className="link text-[13px] text-[var(--muted)]">
            {showEarlier ? "Hide earlier updates" : `${earlier.length} earlier update${earlier.length > 1 ? "s" : ""} on this`}
          </button>
          {showEarlier && (
            <ul className="mt-2 space-y-1.5 border-l rule pl-3">
              {earlier.map((e) => (
                <li key={e.id} className="text-[13px] leading-snug text-[var(--ink-2)]">
                  <span className="num text-[var(--faint)]">{day(e.ts)}</span>{" "}
                  <a href={e.url ?? undefined} target="_blank" rel="noreferrer" className="link">{sentenceCase(tidy(isBoiler(e.headline, e.title) ? cleanTitle(e.title) : e.headline))}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex items-baseline gap-4 text-[13px] text-[var(--muted)]">
        {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="link text-[var(--ink)]">Filing</a>}
        <button onClick={() => setHow((v) => !v)} className="link">How FINN checked this</button>
        <button onClick={onDone} className="ml-auto border border-[var(--ink)] px-2 py-0.5 text-[12px] font-semibold text-[var(--ink)]">Done ✓</button>
      </div>
      {how && (
        <div className="mt-2 space-y-2 border-l rule pl-3 text-[13px] leading-relaxed text-[var(--muted)]">
          <p>Ranked “act on” by the “{f.rule.replace(/[_+]/g, " ")}” rule, matched on the filing’s {f.basis === "pdf" ? "first page" : f.basis}.</p>
          {results && <p>Numbers are from the screener.in quarterly table; QoQ, YoY and margins were computed in code. {results.raw_pdf && <a href={results.raw_pdf} target="_blank" rel="noreferrer" className="link text-[var(--ink)]">Table source</a>}</p>}
          {results?.is_bank && <p>Banks report no EBITDA line; revenue is total interest plus other income.</p>}
          {results?.status === "pending" && <p>{results.note}</p>}
          {mgmt && (
            <>
              <p>A model only copied names and sentences out of the filing; each was found word-for-word in the filing text before it was shown, and code decided who joined or left.{mgmt.dropped ? ` ${mgmt.dropped} unverifiable entr${mgmt.dropped > 1 ? "ies were" : "y was"} dropped.` : ""}{mgmt.note ? ` ${mgmt.note}.` : ""}</p>
              {mgmt.people.map((p, i) => <blockquote key={i} className="serif italic text-[var(--ink-2)]">“{p.evidence}”</blockquote>)}
            </>
          )}
        </div>
      )}
    </Item>
  );
}

function ResultsTable({ c }: { c: ResultsCard }) {
  const rows: [string, Line | null | undefined, boolean][] = [
    ["Revenue", c.lines?.revenue, false], ["EBITDA", c.lines?.ebitda, !!c.is_bank], ["PBT", c.lines?.pbt, false], ["PAT", c.lines?.pat, false],
  ];
  return (
    <table className="num mt-3 w-full text-[15px]">
      <thead>
        <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--faint)]">
          <th className="pb-1 text-left font-medium">₹ crore</th>
          <th className="pb-1 text-right font-medium">{fyq(c.quarter).replace(" ", " ")}</th>
          <th className="pb-1 text-right font-medium">QoQ</th>
          <th className="pb-1 text-right font-medium">YoY</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, l, na]) => (
          <tr key={label} className="border-t rule">
            <td className="py-1.5 text-[14px] text-[var(--muted)]">{label}</td>
            <td className="py-1.5 text-right font-semibold">{l?.value != null ? l.value.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : na ? "n/a" : "—"}</td>
            <td className={`py-1.5 pl-3 text-right ${sig(l?.qoq)}`}>{l ? fmtPct(l.qoq) : ""}</td>
            <td className={`py-1.5 pl-3 text-right ${sig(l?.yoy)}`}>{l ? fmtPct(l.yoy) : ""}</td>
          </tr>
        ))}
        {c.ebitda_margin && (
          <tr className="border-t rule">
            <td className="py-1.5 text-[14px] text-[var(--muted)]">EBITDA margin</td>
            <td className="py-1.5 text-right font-semibold">{c.ebitda_margin.value}%</td>
            <td className={`py-1.5 pl-3 text-right ${sig(c.ebitda_margin.qoq_pp, "pp")}`}>{fmtPp(c.ebitda_margin.qoq_pp)}</td>
            <td className={`py-1.5 pl-3 text-right ${sig(c.ebitda_margin.yoy_pp, "pp")}`}>{fmtPp(c.ebitda_margin.yoy_pp)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function People({ c }: { c: MgmtCard }) {
  return (
    <ul className="mt-3 space-y-3">
      {c.people.map((p, i) => (
        <li key={i} className="border-t rule pt-2.5">
          <p className="text-[15px] leading-snug">
            <span className="label mr-2 !text-[var(--muted)]">{p.change}</span>
            <b className="font-semibold">{cleanName(p.name)}</b>
          </p>
          <p className="text-[13px] leading-snug text-[var(--muted)]">{tidyRole(p.role)}</p>
          {p.change === "left" && p.tenure && <p className="serif mt-1 text-[14px] italic leading-snug text-[var(--ink-2)]">“{tidyProse(p.tenure)}”</p>}
          {p.bio && <p className="mt-1 text-[14px] leading-snug text-[var(--ink-2)]">{tidyProse(p.bio)}</p>}
          {p.change !== "left" && !p.bio && <p className="mt-1 text-[13px] text-[var(--faint)]">No background given in the filing.</p>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- Moves, Notes
function MoveItem({ m, sym, name, reason, linkedCount, px, vx, onOpen }: {
  m: MoveRow; sym: string; name: string; reason?: Filing; linkedCount: number; px: number; vx: number; onOpen: () => void;
}) {
  const [what, why] = moveLead(name, m, reason, linkedCount, px, vx);
  return (
    <Item>
      <div className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.08em]">
        <button onClick={onOpen} className="font-semibold text-[var(--ink)]">{sym}</button>
        <span className="num ml-auto normal-case tracking-normal text-[12px] text-[var(--faint)]">{day(m.date)}</span>
      </div>
      <div className="mt-1 flex items-start gap-4">
        <p className="serif flex-1 text-[17px] leading-snug">{what} <span className={reason ? "" : "text-[var(--accent)]"}>{why}</span></p>
        <div className="num shrink-0 text-right leading-tight">
          <p className={`text-[17px] font-semibold ${m.pct <= -px ? "text-[var(--accent)]" : ""}`}>{fmtPct(m.pct)}</p>
          <p className="text-[12px] text-[var(--muted)]">{m.volx?.toFixed(1)}× vol</p>
        </div>
      </div>
    </Item>
  );
}

function CompactItem({ f, name, onOpenStock }: { f: Filing; name: string; onOpenStock: (s: string) => void }) {
  const text = noteText(f);
  return (
    <div className="border-b rule py-3">
      <Meta sym={f.symbol} kind={CATEGORY_LABEL[f.category] ?? f.category} ts={f.ts} onOpen={() => onOpenStock(f.symbol)} />
      <a href={f.url ?? undefined} target="_blank" rel="noreferrer" aria-label={`${name}: ${text}`} className="mt-1 block text-[15px] leading-snug text-[var(--ink)]">
        {text}
      </a>
    </div>
  );
}

