// Saved screener snapshots (written by scripts/fetch.py) used when the live fetch fails: stale beats an error.
import fs from "node:fs";
import path from "node:path";
import { buildSnapshot } from "./screener";
import type { Snapshot } from "./types";

type T = { headers: string[]; rows: Record<string, (number | null)[]> } | null;
interface SavedScreener {
  ok?: boolean; name?: string; about?: string | null; ratios?: Record<string, string>; variant?: string; url?: string; fetched_at?: string;
  quarters?: T; annual?: T; balance_sheet?: T; cash_flow?: T; ratios_table?: T;
}

export function savedSnapshot(symbol: string): Snapshot | null {
  const file = path.join(process.cwd(), "data", "screener", `${symbol.toUpperCase().replace(/[^A-Z0-9&-]/g, "")}.json`);
  if (!fs.existsSync(file)) return null;
  const d = JSON.parse(fs.readFileSync(file, "utf8")) as SavedScreener;
  if (!d.ok || !d.quarters) return null;
  const snap = buildSnapshot({
    symbol: symbol.toUpperCase(), variant: d.variant ?? "consolidated", url: d.url ?? `https://www.screener.in/company/${symbol}/`,
    name: d.name ?? symbol, about: d.about ?? null, ratios: d.ratios ?? {},
    quarters: d.quarters, annual: d.annual ?? null, bs: d.balance_sheet ?? null, cf: d.cash_flow ?? null, ratioTable: d.ratios_table ?? null,
    fetched_at: d.fetched_at ?? "",
  });
  return { ...snap, stale: true };
}
