// Research extras computed in code from screener's annual tables (no model). Each block carries its own lead line.
export type Table = { headers: string[]; rows: Record<string, (number | null)[]> };

export interface Extras {
  trajectory: null | {
    years: string[]; revenue: (number | null)[]; pat: (number | null)[]; opm: (number | null)[];
    revCagr: number | null; patCagr: number | null; lead: string;
  };
  cash: null | { years: string[]; ocf: (number | null)[]; pat: (number | null)[]; ratio: (number | null)[]; total: number | null; fcf: number | null; lead: string; bad: boolean };
  balance: null | {
    asOf: string; de: number | null; borrowings: number | null; equity: number | null;
    wcDays: number | null; wcDaysThen: number | null; thenYear: string | null;
    debtorDays: number | null; inventoryDays: number | null; payableDays: number | null; ccc: number | null;
    lead: string; bad: boolean;
  };
  isLender: boolean;
}

const row = (t: Table | null, ...names: string[]) => {
  if (!t) return null;
  for (const n of names) if (t.rows[n]) return t.rows[n];
  return null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const cagr = (a: number | null | undefined, b: number | null | undefined, yrs: number) =>
  a != null && b != null && a > 0 && b > 0 && yrs > 0 ? r1((Math.pow(b / a, 1 / yrs) - 1) * 100) : null;
const yr = (h: string) => `FY${h.slice(-2)}`;

/** Last n fiscal-year columns ('Mar YYYY'), skipping TTM / half-year columns. */
function yearIdx(t: Table, n: number): number[] {
  return t.headers.map((h, i) => [h, i] as const).filter(([h]) => /^Mar \d{4}$/.test(h)).slice(-n).map(([, i]) => i);
}

export function computeExtras(name: string, pl: Table | null, bs: Table | null, cf: Table | null, ratios: Table | null): Extras {
  const isLender = !!pl && ("Financing Profit" in pl.rows || !!row(bs, "Deposits"));
  const out: Extras = { trajectory: null, cash: null, balance: null, isLender };

  // ---- five-year trajectory
  if (pl) {
    const idx = yearIdx(pl, 6);
    const sales = row(pl, "Sales", "Revenue"), pat = row(pl, "Net Profit"), op = row(pl, "Operating Profit");
    if (idx.length >= 3 && sales) {
      const pick = (r: (number | null)[] | null) => idx.map((i) => (r ? r[i] : null));
      const rev = pick(sales), p = pick(pat);
      const opm = idx.map((i) => (op && sales && sales[i] ? r1((op[i]! / sales[i]!) * 100) : null));
      const yrs = idx.length - 1;
      const rc = cagr(rev[0], rev[yrs], yrs), pc = cagr(p[0], p[yrs], yrs);
      const span = yrs === 5 ? "five years" : `${yrs} years`;
      let lead = rc == null ? `${name}: not enough history for a trend.`
        : `Over ${span} ${name} compounded revenue ${rc}% a year${pc != null ? ` and profit ${pc}%` : ""}`;
      if (rc != null && opm[0] != null && opm[yrs] != null && Math.abs(opm[yrs]! - opm[0]!) >= 1) {
        lead += `; operating margin ${opm[yrs]! > opm[0]! ? "widened" : "narrowed"} from ${Math.round(opm[0]!)}% to ${Math.round(opm[yrs]!)}%`;
      }
      if (rc != null) lead += ".";
      out.trajectory = { years: idx.map((i) => yr(pl.headers[i])), revenue: rev, pat: p, opm, revCagr: rc, patCagr: pc, lead };
    }
  }

  // ---- cash quality (OCF / PAT); meaningless for lenders, whose operating cash flow is mostly deposit/loan movement
  if (cf && pl && !isLender) {
    const idxCf = yearIdx(cf, 5);
    const ocfRow = row(cf, "Cash from Operating Activity"), fcfRow = row(cf, "Free Cash Flow"), patRow = row(pl, "Net Profit");
    if (idxCf.length >= 3 && ocfRow && patRow) {
      const years = idxCf.map((i) => cf.headers[i]);
      const ocf = idxCf.map((i) => ocfRow[i]);
      const pat = years.map((h) => { const j = pl.headers.indexOf(h); return j >= 0 ? patRow[j] : null; });
      const ratio = ocf.map((o, k) => (o != null && pat[k] ? Math.round((o / pat[k]!) * 100) : null));
      const so = ocf.reduce<number>((a, v) => a + (v ?? 0), 0), sp = pat.reduce<number>((a, v) => a + (v ?? 0), 0);
      const total = sp > 0 ? Math.round((so / sp) * 100) : null;
      const fcf = fcfRow ? idxCf.reduce<number>((a, i) => a + (fcfRow[i] ?? 0), 0) : null;
      const n = years.length;
      const lead = total == null ? `${name} made a loss over the period, so cash conversion isn’t meaningful.`
        : total >= 90 ? `Profits turn into cash: operating cash flow was ${total}% of profit over ${n} years.`
        : total >= 70 ? `Profits mostly turn into cash: operating cash flow was ${total}% of profit over ${n} years.`
        : `Cash lags profit: operating cash flow was only ${total}% of profit over ${n} years.`;
      out.cash = { years: years.map(yr), ocf, pat, ratio, total, fcf, lead, bad: total != null && total < 70 };
    }
  }

  // ---- balance sheet
  if (bs && !isLender) {
    const last = bs.headers.length - 1;
    const eqCap = row(bs, "Equity Capital"), res = row(bs, "Reserves"), borr = row(bs, "Borrowings", "Borrowing");
    const equity = eqCap && res && eqCap[last] != null && res[last] != null ? eqCap[last]! + res[last]! : null;
    const borrowings = borr ? borr[last] : null;
    const de = equity && borrowings != null && equity > 0 ? Math.round((borrowings / equity) * 100) / 100 : null;
    let wcDays: number | null = null, wcDaysThen: number | null = null, thenYear: string | null = null;
    let debtorDays: number | null = null, inventoryDays: number | null = null, payableDays: number | null = null, ccc: number | null = null;
    if (ratios) {
      const ri = yearIdx(ratios, 6);
      const lastR = ri[ri.length - 1], firstR = ri[0];
      const g = (n: string) => (row(ratios, n) && lastR != null ? row(ratios, n)![lastR] : null);
      wcDays = g("Working Capital Days"); debtorDays = g("Debtor Days"); inventoryDays = g("Inventory Days");
      payableDays = g("Days Payable"); ccc = g("Cash Conversion Cycle");
      const wc = row(ratios, "Working Capital Days");
      if (wc && firstR != null && firstR !== lastR) { wcDaysThen = wc[firstR]; thenYear = yr(ratios.headers[firstR]); }
    }
    const debt = de == null ? "Debt level not reported"
      : de < 0.1 ? `Practically debt-free (debt-to-equity ${de.toFixed(2)})`
      : de < 0.5 ? `Modest debt (debt-to-equity ${de.toFixed(2)})`
      : de < 1 ? `Meaningful debt (debt-to-equity ${de.toFixed(2)})`
      : `Heavily borrowed (debt-to-equity ${de.toFixed(2)})`;
    let wc = "";
    if (wcDays != null) {
      wc = wcDays <= 0 ? `; suppliers fund its working capital (${wcDays} days)` : `; working capital ties up ${wcDays} days of sales`;
      if (wcDaysThen != null && Math.abs(wcDays - wcDaysThen) >= 5) wc += `, ${wcDays > wcDaysThen ? "up" : "down"} from ${wcDaysThen} in ${thenYear}`;
    }
    const bad = (de != null && de >= 1) || (wcDays != null && wcDaysThen != null && wcDays - wcDaysThen >= 20);
    out.balance = { asOf: bs.headers[last], de, borrowings, equity, wcDays, wcDaysThen, thenYear, debtorDays, inventoryDays, payableDays, ccc, lead: `${debt}${wc}.`, bad };
  }
  return out;
}
