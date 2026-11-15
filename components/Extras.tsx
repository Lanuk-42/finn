"use client";

import type { Extras } from "@/lib/extras";

const n0 = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 0 }));

function Head({ label, right }: { label: string; right?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--rule-strong)] pb-1.5">
      <h2 className="label !text-[var(--ink)]">{label}</h2>
      {right && <span className="num text-[12px] text-[var(--muted)]">{right}</span>}
    </div>
  );
}

export default function ExtrasView({ x, name }: { x: Extras; name: string }) {
  const fill = (s: string) => s.replace(/\{name\}/g, name);
  const T = x.trajectory, C = x.cash, B = x.balance;
  return (
    <>
      {T && (
        <section className="mt-9">
          <Head label="Five-year trajectory" right={`${T.years[0]}–${T.years[T.years.length - 1]}`} />
          <p className="serif mt-3 text-[18px] leading-[1.3]">{fill(T.lead)}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="num w-full min-w-[300px] text-[14px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--faint)]">
                  <th className="pb-1 text-left font-medium">₹ crore</th>
                  {T.years.map((y) => <th key={y} className="pb-1 text-right font-medium">{y}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t rule"><td className="py-1.5 text-[13px] text-[var(--muted)]">Revenue</td>{T.revenue.map((v, i) => <td key={i} className={`py-1.5 text-right ${i === T.revenue.length - 1 ? "font-semibold" : ""}`}>{n0(v)}</td>)}</tr>
                <tr className="border-t rule"><td className="py-1.5 text-[13px] text-[var(--muted)]">Profit</td>{T.pat.map((v, i) => <td key={i} className={`py-1.5 text-right ${v != null && v < 0 ? "text-[var(--accent)]" : ""} ${i === T.pat.length - 1 ? "font-semibold" : ""}`}>{n0(v)}</td>)}</tr>
                {T.opm.some((v) => v != null) && (
                  <tr className="border-t rule"><td className="py-1.5 text-[13px] text-[var(--muted)]">Op. margin</td>{T.opm.map((v, i) => <td key={i} className="py-1.5 text-right text-[var(--ink-2)]">{v == null ? "—" : `${Math.round(v)}%`}</td>)}</tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-9">
        <Head label="Cash quality" right={C ? (C.basis === "ebitda" ? "operating cash ÷ operating profit" : "operating cash ÷ profit") : undefined} />
        {x.isLender && <p className="serif mt-3 text-[17px] leading-snug text-[var(--ink-2)]">Not meaningful for a lender: its operating cash flow is mostly deposits and loans moving through the book.</p>}
        {C && (
          <>
            <p className={`serif mt-3 text-[18px] leading-[1.3] ${C.bad ? "text-[var(--accent)]" : ""}`}>{fill(C.lead)}</p>
            <div className="num mt-3 grid border-t rule" style={{ gridTemplateColumns: `repeat(${C.years.length}, minmax(0, 1fr))` }}>
              {C.years.map((y, i) => (
                <div key={y} className="border-b rule py-2 text-center">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--faint)]">{y}</p>
                  <p className={`text-[16px] font-semibold ${C.ratio[i] != null && C.ratio[i]! < 70 ? "text-[var(--accent)]" : ""}`}>{C.ratio[i] == null ? "—" : `${C.ratio[i]}%`}</p>
                </div>
              ))}
            </div>
            {C.fcf != null && <p className="num mt-2 text-[13px] text-[var(--muted)]">Free cash flow over the period: ₹{n0(C.fcf)} crore{C.fcf < 0 ? " (negative)" : ""}.</p>}
          </>
        )}
        {!C && !x.isLender && <p className="serif mt-3 text-[17px] text-[var(--ink-2)]">Cash-flow history isn’t published for this company.</p>}
      </section>

      <section className="mt-9">
        <Head label="Balance sheet" right={B ? `as of ${B.asOf}` : undefined} />
        {x.isLender && <p className="serif mt-3 text-[17px] leading-snug text-[var(--ink-2)]">Debt-to-equity and working-capital days don’t apply to a lender; deposits and borrowings are its raw material.</p>}
        {B && (
          <>
            <p className={`serif mt-3 text-[18px] leading-[1.3] ${B.bad ? "text-[var(--accent)]" : ""}`}>{B.lead}</p>
            <dl className="num mt-3 grid grid-cols-3 border-t rule">
              {([
                ["Debt / equity", B.de == null ? "—" : B.de.toFixed(2)],
                ["Borrowings", B.borrowings == null ? "—" : `₹${n0(B.borrowings)} Cr`],
                ["Net worth", B.equity == null ? "—" : `₹${n0(B.equity)} Cr`],
                ["Working cap. days", B.wcDays == null ? "—" : B.wcNotMeaningful ? "n/m*" : String(B.wcDays)],
                ["Debtor days", B.debtorDays == null ? "—" : String(B.debtorDays)],
                ["Inventory days", B.inventoryDays == null ? "—" : String(B.inventoryDays)],
                ["Payable days", B.payableDays == null ? "—" : String(B.payableDays)],
                ["Cash cycle days", B.ccc == null ? "—" : String(B.ccc)],
              ] as const).map(([k, v]) => (
                <div key={k} className="border-b rule py-2 pr-2">
                  <dt className="text-[11px] uppercase tracking-[0.06em] text-[var(--faint)]">{k}</dt>
                  <dd className="text-[15px] font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {B.wcNotMeaningful && <p className="mt-2 text-[12px] text-[var(--muted)]">* Not meaningful here: the reported {B.wcDays} days include cash and investments. The cash cycle row is the trade figure.</p>}
          </>
        )}
      </section>
    </>
  );
}
