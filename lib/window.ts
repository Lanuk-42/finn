// Time-window logic shared by the server page (to pick the default) and the Brief (to render it).
import type { Brief, Filing } from "./types";
import { cleanTitle } from "./format";

export const WINDOWS = [
  { d: 1, label: "24h", phrase: "today", span: "the last 24 hours" },
  { d: 3, label: "3d", phrase: "this week", span: "the last 3 days" },
  { d: 7, label: "7d", phrase: "this week", span: "the last 7 days" },
  { d: 30, label: "30d", phrase: "this month", span: "the last 30 days" },
];
export const MIN_ACT = 3; // default window = the smallest one with at least this many Act items

export const tsMs = (ts: string) => new Date(ts.length === 10 ? ts + "T15:30:00+05:30" : ts).getTime();

/** Act filings in a window, with repeated updates on the same matter (e.g. six CIRP hearings) collapsed into one item. */
export function actGroupsFor(brief: Brief, asOf: number, days: number) {
  const rank = (c: string) => { const i = brief.act_order.indexOf(c); return i < 0 ? 99 : i; };
  const act = brief.filings.filter((f) => f.tier === "Act" && asOf - tsMs(f.ts) <= days * 86400e3);
  const groups: { lead: Filing; earlier: Filing[] }[] = [];
  for (const f of [...act].sort((a, b) => b.ts.localeCompare(a.ts))) {
    const g = groups.find((x) => x.lead.symbol === f.symbol && x.lead.category === f.category && x.lead.category !== "results" && x.lead.rule === f.rule && cleanTitle(x.lead.title) === cleanTitle(f.title));
    if (g) g.earlier.push(f); else groups.push({ lead: f, earlier: [] });
  }
  return groups.sort((a, b) => rank(a.lead.category) - rank(b.lead.category) || b.lead.ts.localeCompare(a.lead.ts));
}

export function autoWindow(brief: Brief): number {
  const asOf = new Date(brief.data_as_of).getTime();
  return WINDOWS.find((w) => actGroupsFor(brief, asOf, w.d).length >= MIN_ACT)?.d ?? WINDOWS[WINDOWS.length - 1].d;
}
