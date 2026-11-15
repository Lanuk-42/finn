"use client";

import type { Stock, Thesis } from "@/lib/types";
import { fyq } from "@/lib/format";
import { shortName } from "@/lib/lead";

export type ThesisLine = { why: string; metric: string; op: string; value: number };

export const METRICS: { key: string; label: string }[] = [
  { key: "ebitda_margin", label: "EBITDA margin" },
  { key: "pat_margin", label: "PAT margin" },
  { key: "revenue_yoy", label: "Revenue growth YoY" },
  { key: "pat_yoy", label: "Profit growth YoY" },
];

/** Re-check a thesis line against the stock's latest-quarter metrics, in the browser. */
export function checkThesis(s: Stock, line: ThesisLine): Thesis {
  const actual = s.metrics?.[line.metric] ?? null;
  const label = METRICS.find((m) => m.key === line.metric)?.label ?? line.metric;
  const status = actual == null ? "n/a" : (line.op === ">=" ? actual >= line.value : actual <= line.value) ? "ok" : "breach";
  return { ...line, rule: `${label} ${line.op} ${line.value}%`, actual, quarter: s.metrics_quarter ?? s.thesis.quarter, status };
}

export default function ThesisEditor({ stocks, lines, onChange, onReset, onClose }: {
  stocks: Stock[]; lines: Record<string, ThesisLine>; onChange: (sym: string, l: ThesisLine) => void; onReset: (sym: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[var(--paper)]">
      <div className="mx-auto max-w-[560px] px-5 pb-16 pt-[max(env(safe-area-inset-top),18px)]">
        <div className="flex items-baseline justify-between border-b-2 border-[var(--rule-strong)] pb-2">
          <span className="serif text-[17px] font-bold">Your thesis lines</span>
          <button onClick={onClose} className="text-[14px] font-semibold">Done</button>
        </div>
        <p className="mt-2 text-[13px] text-[var(--muted)]">Saved on this device. Each line is re-checked against the latest quarter as you edit.</p>
        {stocks.map((s) => {
          const l = lines[s.symbol];
          const t = checkThesis(s, l);
          const custom = l.why !== s.thesis.why || l.metric !== s.thesis.metric || l.op !== s.thesis.op || l.value !== s.thesis.value;
          return (
            <div key={s.symbol} className="border-b rule py-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">{s.symbol}</span>
                <span className="text-[13px] text-[var(--muted)]">{shortName(s.symbol, s.name)}</span>
                <span className={`num ml-auto text-[13px] ${t.status === "breach" ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                  {t.actual == null ? "n/a for this company" : `${t.actual}% in ${fyq(t.quarter)} · ${t.status === "breach" ? "breach" : "holds"}`}
                </span>
              </div>
              <label className="mt-2 block">
                <span className="sr-only">Why I own {s.symbol}</span>
                <textarea
                  value={l.why}
                  rows={2}
                  onChange={(e) => onChange(s.symbol, { ...l, why: e.target.value })}
                  className="w-full resize-none border-b rule bg-transparent py-1 text-[15px] leading-snug outline-none focus:border-[var(--ink)]"
                />
              </label>
              <div className="num mt-2 flex items-center gap-2 text-[14px]">
                <select aria-label="Metric" value={l.metric} onChange={(e) => onChange(s.symbol, { ...l, metric: e.target.value })}
                  className="min-w-0 flex-1 border-b rule bg-transparent py-1 outline-none">
                  {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <select aria-label="Operator" value={l.op} onChange={(e) => onChange(s.symbol, { ...l, op: e.target.value })}
                  className="border-b rule bg-transparent py-1 outline-none">
                  <option value=">=">≥</option>
                  <option value="<=">≤</option>
                </select>
                <input aria-label="Threshold %" type="number" inputMode="decimal" step="0.5" value={Number.isFinite(l.value) ? l.value : ""}
                  onChange={(e) => onChange(s.symbol, { ...l, value: e.target.value === "" ? NaN : Number(e.target.value) })}
                  className="w-16 border-b rule bg-transparent py-1 text-right outline-none" />
                <span className="text-[var(--muted)]">%</span>
              </div>
              {custom && <button onClick={() => onReset(s.symbol)} className="link mt-2 text-[12px] text-[var(--muted)]">Reset to default</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
