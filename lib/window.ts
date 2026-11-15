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

const SAME_MATTER = new Set(["M&A", "litigation", "fund_raise", "credit_rating", "pledging"]);

export const tsMs = (ts: string) => new Date(ts.length === 10 ? ts + "T15:30:00+05:30" : ts).getTime();

/** How urgent an Act item is, by fixed rule: thesis breaches and promise misses first, then large profit or margin
 * declines, then management changes, then legal and everything else. */
export function severity(f: Filing): number {
  const why = (f.card?.type === "results" && f.card.why_act) || [];
  if (why.some((w) => /thesis breach|promise/.test(w))) return 4;
  if (why.length) return 3;
  if (f.category === "management_change") return 2;
  return 1;
}

/** Filings already shown inside a flagged pattern (e.g. a rating action behind "on rating watch") aren't repeated in Act. */
export const inPattern = (brief: Brief) => new Set((brief.patterns ?? []).filter((p) => p.severity === "flag").flatMap((p) => p.filings));

/** Act filings in a window, with repeated updates on the same matter (e.g. six CIRP hearings) collapsed into one item. */
export function actGroupsFor(brief: Brief, asOf: number, days: number) {
  const rank = (c: string) => { const i = brief.act_order.indexOf(c); return i < 0 ? 99 : i; };
  const covered = inPattern(brief);
  const act = brief.filings.filter((f) => f.tier === "Act" && !covered.has(f.id) && asOf - tsMs(f.ts) <= days * 86400e3);
  const groups: { lead: Filing; earlier: Filing[] }[] = [];
  for (const f of [...act].sort((a, b) => b.ts.localeCompare(a.ts))) {
    const g = groups.find((x) => x.lead.symbol === f.symbol && x.lead.category === f.category && x.lead.category !== "results" && x.lead.rule === f.rule &&
      (cleanTitle(x.lead.title) === cleanTitle(f.title) ||
        // the same deal, legal matter, raise or rating within two weeks is one item (e.g. Jio Platforms' IPO pricing + listing)
        (SAME_MATTER.has(f.category) && Math.abs(tsMs(x.lead.ts) - tsMs(f.ts)) <= 14 * 86400e3)));
    if (g) g.earlier.push(f); else groups.push({ lead: f, earlier: [] });
  }
  const n = (g: { lead: Filing }) => (g.lead.card?.type === "results" && g.lead.card.why_act?.length) || 0;
  return groups.sort((a, b) => severity(b.lead) - severity(a.lead) || n(b) - n(a) || rank(a.lead.category) - rank(b.lead.category) || b.lead.ts.localeCompare(a.lead.ts));
}

export function autoWindow(brief: Brief): number {
  const asOf = new Date(brief.data_as_of).getTime();
  return WINDOWS.find((w) => actGroupsFor(brief, asOf, w.d).length >= MIN_ACT)?.d ?? WINDOWS[WINDOWS.length - 1].d;
}
