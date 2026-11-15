import fs from "node:fs";
import path from "node:path";
import App from "@/components/App";
import type { Brief, PromiseFile } from "@/lib/types";
import { autoWindow } from "@/lib/window";

export const dynamic = "force-static";

const MAX_WINDOW_DAYS = 30;

function load<T>(...p: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", ...p), "utf8")) as T;
}

export default function Page() {
  const full = load<Brief>("brief.json");
  // Ship only what the largest window can show: filings from the last 30 days (+ any a visible move links to).
  const asOf = new Date(full.data_as_of).getTime();
  const cutoff = asOf - MAX_WINDOW_DAYS * 86400e3;
  const moves = Object.fromEntries(
    Object.entries(full.moves).map(([s, rows]) => [s, rows.filter((r) => new Date(r.date + "T15:30:00+05:30").getTime() >= cutoff)]),
  );
  const linked = new Set(Object.values(moves).flatMap((rows) => rows.flatMap((r) => r.filings)));
  const filings = full.filings.filter((f) => new Date(f.ts).getTime() >= cutoff || linked.has(f.id));
  const brief: Brief = { ...full, filings, moves };

  const dir = path.join(process.cwd(), "data", "promises");
  const promises: PromiseFile[] = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => load<PromiseFile>("promises", f))
    : [];
  // the screener page each tracker's reported figures come from, so every "actual" can link to its table
  for (const p of promises) {
    const f = path.join(process.cwd(), "data", "screener", `${p.symbol}.json`);
    if (fs.existsSync(f)) p.screener_url = (JSON.parse(fs.readFileSync(f, "utf8")) as { url?: string }).url ?? null;
  }
  return <App brief={brief} promises={promises} defaultWin={autoWindow(brief)} />;
}
