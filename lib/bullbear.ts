// Bull vs bear, built only from facts FINN has already computed. Each candidate is a fixed template with a strength
// score; the strongest three per side are shown. No model writes any of it.
import type { Pattern, PromiseFile, Snapshot, Stock } from "./types";
import { fyq } from "./format";
import { actualText, isBad, poss, promiseTitle, targetText, trailingMisses } from "./lead";

export type Point = { text: string; anchor: string; source: string; score: number };

const r0 = (n: number) => (Math.abs(n) >= 10 ? Math.round(n).toString() : n.toFixed(1));
const ratioNum = (s?: string) => (s ? Number(s.replace(/[^\d.-]/g, "")) : NaN);

export function bullBear(name: string, snap: Snapshot | null, pf?: PromiseFile, patterns: Pattern[] = [], stock?: Stock) {
  const bull: Point[] = [], bear: Point[] = [];
  const L = snap?.ok ? snap.latest : undefined;
  const X = snap?.ok ? snap.extras : undefined;
  const q = L ? fyq(L.quarter) : "";

  // ---- latest quarter
  const rev = L?.lines.revenue?.yoy, pat = L?.lines.pat?.yoy;
  if (rev != null && rev >= 15) bull.push({ text: `Revenue grew ${r0(rev)}% from a year ago in ${q}.`, anchor: "latest", source: "Latest quarter", score: 40 + rev });
  if (rev != null && rev < 0) bear.push({ text: `Revenue fell ${r0(-rev)}% from a year ago in ${q}.`, anchor: "latest", source: "Latest quarter", score: 60 - rev });
  if (pat != null && pat >= 15) bull.push({ text: `Profit grew ${r0(pat)}% from a year ago in ${q}.`, anchor: "latest", source: "Latest quarter", score: 40 + Math.min(pat, 100) });
  if (pat != null && pat < 0) bear.push({ text: `Profit fell ${r0(-pat)}% from a year ago in ${q}.`, anchor: "latest", source: "Latest quarter", score: 60 - Math.max(pat, -100) });
  if (L?.ebitda_margin != null && L.ebitda_margin_ya != null) {
    const d = Math.round((L.ebitda_margin - L.ebitda_margin_ya) * 10) / 10;
    if (d >= 1) bull.push({ text: `EBITDA margin widened ${d}pp to ${L.ebitda_margin}% in ${q}.`, anchor: "latest", source: "Latest quarter", score: 40 + d * 5 });
    if (d <= -1) bear.push({ text: `EBITDA margin narrowed ${-d}pp to ${L.ebitda_margin}% in ${q}.`, anchor: "latest", source: "Latest quarter", score: 45 - d * 5 });
  }

  // ---- five-year trajectory
  const T = X?.trajectory;
  if (T?.revCagr != null && T.revCagr >= 12) bull.push({ text: `Revenue compounded ${r0(T.revCagr)}% a year over ${T.years.length - 1} years.`, anchor: "trajectory", source: "Five-year trajectory", score: 35 + T.revCagr });
  if (T?.patCagr != null && T.patCagr >= 15) bull.push({ text: `Profit compounded ${r0(T.patCagr)}% a year over ${T.years.length - 1} years.`, anchor: "trajectory", source: "Five-year trajectory", score: 35 + Math.min(T.patCagr, 60) });
  if (T?.revCagr != null && T.patCagr != null && T.revCagr - T.patCagr >= 5)
    bear.push({ text: `Profit (${r0(T.patCagr)}% a year) has lagged revenue (${r0(T.revCagr)}% a year) over ${T.years.length - 1} years.`, anchor: "trajectory", source: "Five-year trajectory", score: 40 + (T.revCagr - T.patCagr) });
  const o0 = T?.opm[0], o1 = T?.opm[T.opm.length - 1];
  if (o0 != null && o1 != null && o1 - o0 >= 2) bull.push({ text: `Operating margin widened from ${Math.round(o0)}% to ${Math.round(o1)}% over ${T!.years.length - 1} years.`, anchor: "trajectory", source: "Five-year trajectory", score: 35 + (o1 - o0) * 3 });
  if (o0 != null && o1 != null && o0 - o1 >= 2) bear.push({ text: `Operating margin narrowed from ${Math.round(o0)}% to ${Math.round(o1)}% over ${T!.years.length - 1} years.`, anchor: "trajectory", source: "Five-year trajectory", score: 40 + (o0 - o1) * 3 });

  // ---- cash quality and balance sheet
  const C = X?.isLender ? null : X?.cash;
  const what = C?.basis === "ebitda" ? "operating profit" : "profit";
  if (C?.total != null && C.total >= 90) bull.push({ text: `Operating cash flow was ${C.total}% of ${what} over ${C.years.length} years.`, anchor: "cash", source: "Cash quality", score: 45 + Math.min(C.total - 90, 30) });
  if (C?.total != null && C.total < 70) bear.push({ text: C.total < 0 ? `Operating cash flow was negative over ${C.years.length} years, while ${what} was positive.` : `Operating cash flow was only ${C.total}% of ${what} over ${C.years.length} years.`, anchor: "cash", source: "Cash quality", score: 55 + (70 - C.total) });
  const B = X?.isLender ? null : X?.balance;
  if (B?.de != null && B.de < 0.1) bull.push({ text: `Practically debt-free (debt-to-equity ${B.de.toFixed(2)}).`, anchor: "balance", source: "Balance sheet", score: 38 });
  if (B?.de != null && B.de >= 0.5) bear.push({ text: `Carries ${B.de >= 1 ? "heavy" : "meaningful"} debt (debt-to-equity ${B.de.toFixed(2)}).`, anchor: "balance", source: "Balance sheet", score: 40 + B.de * 20 });
  if (B && !B.wcNotMeaningful && B.wcDays != null && B.wcDaysThen != null && B.wcDays > 0 && B.wcDaysThen > 0) {
    const d = B.wcDays - B.wcDaysThen;
    if (d >= 20) bear.push({ text: `Working capital ties up ${B.wcDays} days of sales, up from ${B.wcDaysThen} in ${B.thenYear}.`, anchor: "balance", source: "Balance sheet", score: 40 + Math.min(d, 60) });
    if (d <= -15) bull.push({ text: `Working capital fell to ${B.wcDays} days of sales from ${B.wcDaysThen} in ${B.thenYear}.`, anchor: "balance", source: "Balance sheet", score: 35 + Math.min(-d, 40) / 2 });
  }
  const roce = ratioNum(snap?.ok ? snap.ratios?.["ROCE"] : undefined);
  if (Number.isFinite(roce) && roce >= 20) bull.push({ text: `Return on capital employed is ${roce}%.`, anchor: "ratios", source: "Key ratios", score: 30 + Math.min(roce, 60) / 2 });

  // ---- what management promised
  if (pf) {
    const res = pf.promises.filter((p) => p.status === "resolved");
    const kept = res.filter((p) => p.verdict !== "Missed");
    const missed = res.filter((p) => p.verdict === "Missed");
    if (kept.length) bull.push({ text: `Management kept ${kept.length} of ${res.length} dated promise${res.length > 1 ? "s" : ""} (e.g. ${promiseTitle(kept[0])}, delivered ${actualText(kept[0])}).`, anchor: "promises", source: "Promise tracker", score: 50 + kept.length * 5 });
    for (const p of missed) bear.push({ text: `Missed its promise of ${promiseTitle(p)}: delivered ${actualText(p)}.`, anchor: "promises", source: "Promise tracker", score: 70 });
    for (const p of pf.promises.filter((x) => x.status === "in_progress" && isBad(x)))
      bear.push({ text: `Off track on its promise of ${promiseTitle(p)}: ${actualText(p)} so far.`, anchor: "promises", source: "Promise tracker", score: 65 });
    for (const p of pf.promises.filter((x) => x.status === "standing")) {
      if (trailingMisses(p) >= 1) bear.push({ text: `Below its promised ${promiseTitle(p).replace(/^Ongoing /, "")} band for ${trailingMisses(p) === 1 ? "the latest quarter" : `${trailingMisses(p)} straight quarters`}.`, anchor: "promises", source: "Promise tracker", score: 60 });
      else if (p.tested && p.held === p.tested) bull.push({ text: `Held its promised ${promiseTitle(p).replace(/^Ongoing /, "")} band for ${p.held} straight quarters.`, anchor: "promises", source: "Promise tracker", score: 45 + (p.held ?? 0) * 3 });
    }
  }

  // ---- filing patterns and your thesis
  for (const p of patterns.filter((x) => x.severity === "flag"))
    bear.push({ text: p.lead.replace(/\{name\}’s/g, poss(name)).replace(/\{name\}/g, name), anchor: "patterns", source: "Filing patterns", score: 75 });
  if (stock?.thesis.status === "breach")
    bear.push({ text: `Breaks your thesis line: ${stock.thesis.rule.split(/ [<>]=/)[0]} is ${stock.thesis.actual}% vs your ${stock.thesis.op === ">=" ? "≥" : "≤"} ${stock.thesis.value}%.`, anchor: "thesis", source: "Your thesis", score: 80 });
  if (stock?.thesis.status === "ok")
    bull.push({ text: `Holds your thesis line: ${stock.thesis.rule.split(/ [<>]=/)[0]} is ${stock.thesis.actual}% (your line ${stock.thesis.op === ">=" ? "≥" : "≤"} ${stock.thesis.value}%).`, anchor: "thesis", source: "Your thesis", score: 42 });

  const top = (xs: Point[]) => xs.sort((a, b) => b.score - a.score).filter((x, i, a) => a.findIndex((y) => y.source === x.source && y.text === x.text) === i).slice(0, 3);
  return { bull: top(bull), bear: top(bear) };
}
