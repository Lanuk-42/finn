// Plain-English lead lines. These are fixed templates filled from numbers code already computed: no model writes them.
import type { Filing, MgmtCard, MoveRow, Promise_, PromiseFile, ResultsCard, Snapshot, Stock } from "./types";
import { cleanTitle, day, fyq } from "./format";

const SHORT: Record<string, string> = {
  RELIANCE: "Reliance", HDFCBANK: "HDFC Bank", TCS: "TCS", SUNPHARMA: "Sun Pharma", ASIANPAINT: "Asian Paints",
  DIXON: "Dixon", POLYCAB: "Polycab", PERSISTENT: "Persistent", DEEPAKNTR: "Deepak Nitrite", CAMPUS: "Campus",
  BEL: "BEL", LUPIN: "Lupin", CHOLAFIN: "Chola", MARUTI: "Maruti", TRENT: "Trent", JKCEMENT: "JK Cement",
  SAFARI: "Safari", GRAVITA: "Gravita",
};

export function shortName(symbol: string, full?: string): string {
  if (SHORT[symbol]) return SHORT[symbol];
  if (!full) return symbol;
  return full.replace(/\s*\(.*?\)\s*/g, " ").replace(/\b(Ltd|Limited|Industries|Corporation|Company|India)\b\.?/gi, "").replace(/\s+/g, " ").trim() || symbol;
}

export const poss = (name: string) => (name.endsWith("s") ? `${name}’` : `${name}’s`);
const r0 = (n: number) => Math.abs(n).toFixed(Math.abs(n) < 10 ? 1 : 0);

// --------------------------------------------------------------- results
type Lines = { revenue?: { yoy: number | null } | null; pat?: { yoy: number | null } | null };

export function resultsSentence(name: string, L: Lines | undefined, marginYoyPp?: number | null): string {
  const r = L?.revenue?.yoy, p = L?.pat?.yoy;
  if (r == null || p == null) return `${name} reported results; year-ago comparison not available.`;
  let s: string;
  if (p < 0 && r >= 0) s = `${poss(name)} profit fell ${r0(p)}% despite ${r0(r)}% higher revenue`;
  else if (p >= 0 && r < 0) s = `${poss(name)} profit rose ${r0(p)}% even as revenue fell ${r0(r)}%`;
  else if (p < 0 && r < 0) s = `${poss(name)} revenue fell ${r0(r)}% and profit ${r0(p)}%`;
  else if (p < 5 && r >= 10) s = `${name} grew revenue ${r0(r)}% but profit only ${r0(p)}%`;
  else s = `${name} grew revenue ${r0(r)}% and profit ${r0(p)}% from a year ago`;
  if (marginYoyPp != null && Math.abs(marginYoyPp) >= 1) s += `; EBITDA margin ${marginYoyPp < 0 ? "down" : "up"} ${Math.abs(marginYoyPp).toFixed(1)}pp`;
  return s + ".";
}

export function resultsLead(name: string, c: ResultsCard): string {
  if (c.status !== "ok") return `${name} filed ${fyq(c.quarter)} results; the tables haven’t caught up yet.`;
  return resultsSentence(name, c.lines ?? undefined, c.ebitda_margin?.yoy_pp);
}

export function snapshotLead(name: string, s: Snapshot): string {
  const L = s.latest!;
  const m = L.ebitda_margin != null && L.ebitda_margin_ya != null ? Math.round((L.ebitda_margin - L.ebitda_margin_ya) * 10) / 10 : null;
  return resultsSentence(name, L.lines, m).replace(/\.$/, ` in ${fyq(L.quarter)}.`);
}

// --------------------------------------------------------------- management
const TITLE = /^(Mr|Ms|Mrs|Dr|Shri|Smt)\s*\.?\s*/i;
export const cleanName = (n: string) => n.replace(TITLE, "").replace(/\s+/g, " ").trim();
const shortRole = (r: string) => tidyRole(r.split("·").pop()!.replace(/\s*\(.*?\)\s*/g, " "));

export function mgmtLead(name: string, c: MgmtCard, fallback: string): string {
  const P = c.people;
  if (!P.length) return `${name}: ${fallback}`;
  const TOP = /chief executive|\bceo\b|chief financial|\bcfo\b|managing director|chair(man|person)?\b(?! emeritus)|whole[- ]time|executive director/i;
  const left = P.find((p) => p.change === "left" && TOP.test(p.role)) ?? P.find((p) => p.change === "left");
  const others = P.filter((p) => p.change === "joined" && (!left || cleanName(p.name) !== cleanName(left.name)));
  const joined = others.find((p) => TOP.test(p.role) && !/emeritus/i.test(p.role)) ?? others[0];
  const parts: string[] = [];
  if (left) parts.push(`${cleanName(left.name)} leaves as ${shortRole(left.role)}`);
  if (joined) parts.push(`${cleanName(joined.name)} joins as ${shortRole(joined.role)}`);
  if (!parts.length) {
    const p = P[0];
    return `${name ? name + " " : ""}${p.change === "reappointed" ? "reappoints" : "redesignates"} ${cleanName(p.name)} as ${shortRole(p.role)}.`;
  }
  const more = P.length - parts.length;
  return `${name ? name + ": " : ""}${parts.join("; ")}${more > 0 ? `, plus ${more} other change${more > 1 ? "s" : ""}` : ""}.`;
}

// --------------------------------------------------------------- other filings
// Exchange subjects arrive In Title Case; lower-case the common words so a lead reads like a sentence.
const COMMON = new Set(("a an and as at by for from in into is its of on or the to under with regarding relating pursuant via way " +
  "reference issued result results financial quarter half year ended intimation update updates outcome meeting board approval " +
  "appointment proposal issue issuance securities submission disclosure announcement change changes director directors " +
  "management order orders receipt received statement media release press clarification news copy transcript call earnings " +
  "conference investor investors presentation unaudited audited standalone consolidated subsidiary wholly owned incorporation " +
  "acquisition completion agreement execution letter award contract new launches launch partners signs wins deal company " +
  "proposed public offer equity shares listing allotment non-convertible debentures commercial paper rating credit " +
  "resignation retirement senior personnel officer chief independent additional dividend record date payment interim " +
  "observation draft red herring prospectus scheme arrangement amalgamation merger demerger order passed setting aside receives receive approves announces appoints inspection concluded").split(" "));

/** PDF text spacing around hyphens: "Non - Executive" -> "Non-Executive", "multi -sector" -> "multi-sector". */
export const tidyRole = (r: string) => (r || "").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
export const tidyProse = (t: string) => (t || "").replace(/(\w) -(?=\w)/g, "$1-").replace(/(\w)- (?=\w)/g, "$1-").replace(/\s+/g, " ").trim();

/** Display tidy for exchange text: BSE escapes apostrophes as '' and pads with odd spacing. */
export function tidy(t: string): string {
  return (t || "").replace(/''/g, "’").replace(/\s+([,.;:])/g, "$1").replace(/\.{3,}\s*$/, "…").replace(/\s+/g, " ").trim();
}

/** The line a compact row shows: verified names for management changes, else the company's own subject in sentence case. */
export function noteText(f: Filing): string {
  if (f.card?.type === "management" && f.card.people.length) return mgmtLead("", f.card, "").replace(/^:\s*/, "").replace(/^\s*/, "").replace(/^./, (c) => c.toUpperCase());
  const raw = isBoiler(f.headline, f.title) ? cleanTitle(f.title) : f.headline;
  if (isBoiler(raw, "")) return "Regulatory disclosure; subject not stated in the filing title";
  return sentenceCase(tidy(raw));
}

export function sentenceCase(t: string): string {
  const words = t.split(/\s+/);
  const letters = words.filter((w) => /[A-Za-z]/.test(w));
  const caps = letters.filter((w) => /^[A-Z][a-z]/.test(w)).length;
  if (letters.length < 4 || caps / letters.length < 0.6) return t;
  return words.map((w, i) => (i > 0 && COMMON.has(w.toLowerCase().replace(/[^a-z-]/g, "")) && /^[A-Z][a-z-]*[,.:;]?$/.test(w) ? w.toLowerCase() : w)).join(" ");
}

export function isBoiler(h: string, title: string) {
  return !h || h.toLowerCase() === title.toLowerCase() || /^(disclosure|announcement|intimation) under/i.test(h) || /^(as attached|please find)/i.test(h);
}

export function filingLead(name: string, f: Filing): string {
  if (f.card?.type === "results") return resultsLead(name, f.card);
  if (f.card?.type === "management") return mgmtLead(name, f.card, isBoiler(f.headline, f.title) ? cleanTitle(f.title) : f.headline);
  const text = sentenceCase(tidy(isBoiler(f.headline, f.title) ? cleanTitle(f.title) : f.headline));
  const end = `${text.replace(/[.…]$/, "")}${text.endsWith("…") ? "…" : "."}`;
  return text.toLowerCase().startsWith(name.toLowerCase()) || text.toUpperCase().startsWith(f.symbol + " ") ? end : `${name}: ${end}`;
}

// --------------------------------------------------------------- moves
/** Returns [what happened, why]; the UI marks an unexplained "why" with the accent. Price % lives in the number column. */
export function moveLead(name: string, m: MoveRow, reason: Filing | undefined, linkedCount: number, px: number, vx: number): [string, string] {
  const bigPx = Math.abs(m.pct) >= px, bigVol = (m.volx ?? 0) >= vx;
  let s = bigPx ? `${name} ${m.pct >= 0 ? "rose" : "fell"} ${Math.abs(m.pct).toFixed(1)}%` : `${name} traded ${m.volx?.toFixed(1)}× its usual volume`;
  if (bigPx && bigVol) s += ` on ${m.volx?.toFixed(1)}× its usual volume`;
  if (reason) {
    const what = reason.card?.type === "results" ? `its ${fyq(reason.card.quarter)} results` : `a ${catNoun(reason.category)} filing`;
    return [s + ",", reason.ts.slice(0, 10) === m.date ? `the day of ${what}.` : `after ${what} on ${day(reason.ts)}.`];
  }
  return [s + ",", linkedCount ? "with only routine paperwork filed." : "with no filing to explain it."];
}

function catNoun(c: string) {
  return ({ management_change: "management-change", litigation: "legal", "M&A": "deal", fund_raise: "fund-raise", earnings_call: "earnings-call",
    credit_rating: "credit-rating", dividend: "dividend", press_release: "company-news", capex: "capex", insider_trading: "insider" } as Record<string, string>)[c] ?? "company";
}

// --------------------------------------------------------------- thesis
const METRIC_NOUN: Record<string, string> = { ebitda_margin: "EBITDA margin", pat_margin: "PAT margin", revenue_yoy: "revenue growth", pat_yoy: "profit growth" };

export function breachLead(name: string, s: Stock): string {
  const t = s.thesis;
  return `${poss(name)} ${METRIC_NOUN[t.metric] ?? t.metric} is ${t.actual}% in ${fyq(t.quarter)}, ${t.op === ">=" ? "below" : "above"} your ${t.value}% line.`;
}

// --------------------------------------------------------------- promises
export function targetText(p: Promise_): string {
  const u = p.unit === "crore" ? " Cr" : p.unit === "bps" ? " bps" : "%";
  const f = (n: number) => (p.unit === "crore" ? `₹${n.toLocaleString("en-IN")}` : p.unit === "bps" && p.kind === "change" ? `+${n}` : `${n}`);
  if (p.low !== null && p.high !== null && p.low !== p.high) return `${f(p.low)}–${f(p.high)}${u}`;
  const v = p.low ?? p.high;
  if (v === null) return "—";
  const pre = p.kind === "at_least" ? "≥" : p.kind === "at_most" ? "≤" : p.kind === "about" ? "~" : "";
  return `${pre}${f(v)}${u}`;
}

export function actualValue(p: Promise_): number | null {
  if (p.status === "standing") return p.checks?.length ? p.checks[p.checks.length - 1].value : null;
  const v = p.status === "in_progress" ? p.tracking ?? p.actual : p.actual;
  return v ?? null;
}

export function actualText(p: Promise_): string {
  const v = actualValue(p);
  if (v == null) return "—";
  if (p.unit === "bps") return `${v > 0 ? "+" : "−"}${Math.abs(v)} bps`;
  if (p.metric === "revenue") return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
  return `${v}%`;
}

/** Missed, or tracking below the promise. */
export function isBad(p: Promise_): boolean {
  if (p.status === "resolved") return p.verdict === "Missed";
  if (p.status === "standing") return trailingMisses(p) > 0;
  const v = actualValue(p);
  if (v == null || p.metric === "revenue" || p.low == null) return false;
  return v < p.low;
}

export function trailingMisses(p: Promise_): number {
  let n = 0;
  for (const c of [...(p.checks ?? [])].reverse()) { if (c.verdict === "Missed") n++; else break; }
  return n;
}

export function verdictLabel(p: Promise_): string {
  if (p.status === "resolved") return p.verdict ?? "Met";
  if (p.status === "standing") return p.tested ? (trailingMisses(p) ? "Slipping" : "Holding") : "Too early";
  return isBad(p) ? "Off track" : "On track";
}

const METRIC_SHORT: Record<string, string> = {
  revenue: "revenue", revenue_growth_yoy: "revenue growth", ebitda_margin: "EBITDA margin", ebit_margin: "EBIT margin",
  pat_margin: "PAT margin", ebitda_growth_yoy: "EBITDA growth", pat_growth_yoy: "profit growth",
};

export function promiseTitle(p: Promise_): string {
  const per = p.status === "standing" ? "Ongoing" : p.period;
  return `${per} ${METRIC_SHORT[p.metric] ?? p.metric} ${targetText(p)}`;
}

export function trackerLead(name: string, pf: PromiseFile): string {
  const P = pf.promises;
  const resolved = P.filter((p) => p.status === "resolved");
  const kept = resolved.filter((p) => p.verdict !== "Missed");
  const clauses: string[] = [];
  if (resolved.length) {
    const periods = [...new Set(resolved.map((p) => p.period))];
    const allBeat = kept.length === resolved.length && resolved.every((p) => p.verdict === "Beat");
    const n = resolved.length === 1 ? "its" : resolved.length === 2 ? "both its" : `all ${resolved.length} of its`;
    clauses.push(kept.length === resolved.length
      ? `${name} ${allBeat ? "beat" : "met"} ${n} ${periods.length === 1 ? periods[0] + " " : ""}target${resolved.length > 1 ? "s" : ""}`
      : `${name} kept ${kept.length} of ${resolved.length} dated targets`);
  }
  const off = P.find((p) => p.status === "in_progress" && isBad(p));
  const slipping = P.find((p) => p.status === "standing" && trailingMisses(p) >= 1);
  const holding = P.filter((p) => p.status === "standing" && p.tested && !trailingMisses(p)).sort((a, b) => (b.tested ?? 0) - (a.tested ?? 0))[0];
  const subj = clauses.length ? "its" : poss(name);
  if (off) clauses.push(`${subj} ${off.period} ${METRIC_SHORT[off.metric]} promise is off track: ${targetText(off)} promised, ${actualText(off)} so far`);
  else if (slipping) {
    const k = trailingMisses(slipping);
    clauses.push(`${subj} ${METRIC_SHORT[slipping.metric]} promise is slipping: below its ${targetText(slipping)} band for ${k === 1 ? "the latest quarter" : `${k} straight quarters`}`);
  } else if (holding) clauses.push(`${clauses.length ? "it has" : `${name} has`} ${holding.checks?.some((c) => c.verdict === "Beat") ? "stayed at or above" : "held"} its ${targetText(holding)} ${METRIC_SHORT[holding.metric]} band ${holding.held === holding.tested ? `for ${holding.held} straight quarters` : `in ${holding.held} of ${holding.tested} quarters`}`);
  if (!clauses.length) return `${name} gave no company-wide target that the reported numbers can check yet.`;
  const s = clauses.join(clauses.length > 1 && (off || slipping) ? ", but " : "; ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

// --------------------------------------------------------------- results card -> promise link
const QMON: Record<string, number> = { Jun: 1, Sep: 2, Dec: 3, Mar: 4 };
/** Does a fiscal period ('FY27', 'H1FY27', 'Q2FY27') contain the quarter ending at `label` ('Sep 2026')? */
export function periodCovers(period: string, label: string): boolean {
  const m = /^(Q[1-4]|H[12])?FY(\d{2})$/.exec(period || "");
  const q = /^(Mar|Jun|Sep|Dec) (\d{4})$/.exec(label || "");
  if (!m || !q) return false;
  const qn = QMON[q[1]], fy = (Number(q[2]) + (q[1] === "Mar" ? 0 : 1)) % 100;
  if (fy !== Number(m[2])) return false;
  if (!m[1]) return true;
  if (m[1].startsWith("H")) return m[1] === "H1" ? qn <= 2 : qn >= 3;
  return Number(m[1][1]) === qn;
}

export type PromiseLink = { text: string; bad: boolean };

/** One line tying a results card to what management promised, computed from the card and the tracker. */
export function promiseLink(c: ResultsCard, pf: PromiseFile | undefined): PromiseLink | null {
  if (!pf || c.status !== "ok") return null;
  const cands: { p: Promise_; v: string; bad: boolean; score: number }[] = [];
  for (const p of pf.promises) {
    const what = `${targetText(p)} ${p.status === "standing" ? "" : p.period + " "}${METRIC_SHORT[p.metric] ?? p.metric}`.replace(/\s+/g, " ");
    if (p.status === "standing") {
      const ck = p.checks?.find((x) => x.quarter === c.quarter);
      if (ck) cands.push({ p, v: `Guided ${what} → delivered ${ck.value}%`, bad: ck.verdict === "Missed", score: 2 });
      continue;
    }
    if (!periodCovers(p.period, c.quarter)) continue;
    if (p.unit === "bps") {
      const v = actualValue(p);
      // a running ("so far") figure belongs only on the card for the quarter it runs through
      if (v != null && (p.basis ?? "").split(":")[0].trim().endsWith(c.quarter)) cands.push({ p, v: `Guided ${what} → ${v > 0 ? "+" : "−"}${Math.abs(v)} bps so far`, bad: isBad(p), score: 3 });
      continue;
    }
    let cur: number | null | undefined = null;
    if (p.metric === "ebitda_margin") cur = c.ebitda_margin?.value;
    else if (p.metric === "revenue_growth_yoy") cur = c.lines?.revenue?.yoy;
    else if (p.metric === "pat_growth_yoy") cur = c.lines?.pat?.yoy;
    else if (p.metric === "ebitda_growth_yoy") cur = c.lines?.ebitda?.yoy;
    if (cur == null) continue;
    const below = p.low != null && cur < p.low;
    cands.push({ p, v: `Guided ${what} → delivered ${cur}% this quarter`, bad: below, score: 1 + (below ? 3 : 0) + (p.metric.endsWith("margin") ? 1 : 0) });
  }
  if (!cands.length) return null;
  const best = cands.sort((a, b) => b.score - a.score)[0];
  return { text: best.v, bad: best.bad };
}
