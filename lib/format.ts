export const IST = "Asia/Kolkata";

export function cr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)}L Cr`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return "n/m";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function pp(n: number | null | undefined): string {
  if (n === null || n === undefined) return "n/m";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}pp`;
}

export function tone(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-[var(--muted)]";
  return n > 0 ? "text-[var(--up)]" : n < 0 ? "text-[var(--down)]" : "text-[var(--muted)]";
}

export function when(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function day(ts: string): string {
  return new Date(ts.length === 10 ? ts + "T12:00:00+05:30" : ts).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" });
}

/** Strip the exchange's boilerplate prefixes so the title says what happened. */
export function cleanTitle(t: string): string {
  return (t || "")
    .replace(/^Announcement under Regulation 30 \(LODR\)\s*-\s*/i, "")
    .replace(/^Announcement Under Regulation 30 Of SEBI LODR\s*-\s*/i, "")
    .replace(/^Board Meeting Outcome for\s+/i, "Board outcome: ")
    .replace(/\s+/g, " ")
    .trim();
}

export const CATEGORY_LABEL: Record<string, string> = {
  results: "Results", "M&A": "M&A", fund_raise: "Fund raise", management_change: "Management", litigation: "Legal / regulatory",
  insider_trading: "Insider / SAST", earnings_call: "Earnings call", investor_meetings: "Investor meet", credit_rating: "Credit rating",
  dividend: "Dividend", bonus_split: "Bonus / split", capex: "Capex", press_release: "Company news", postal_ballot: "Postal ballot",
  agm_egm: "AGM / EGM", pledging: "Pledge", unclassified: "Paperwork",
};

/** 'Sep 2026' -> 'Q2 FY27' (Indian fiscal year: Apr–Mar). */
export function fyq(label: string | null | undefined): string {
  const m = /^(Mar|Jun|Sep|Dec) (\d{4})$/.exec(label ?? "");
  if (!m) return label ?? "";
  const y = Number(m[2]);
  const q = { Jun: 1, Sep: 2, Dec: 3, Mar: 4 }[m[1] as "Jun"]!;
  const fy = m[1] === "Mar" ? y : y + 1;
  return `Q${q} FY${String(fy).slice(-2)}`;
}

export const opSym = (op: string) => (op === ">=" ? "≥" : op === "<=" ? "≤" : op);
