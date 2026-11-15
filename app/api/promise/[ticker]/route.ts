import fs from "node:fs";
import path from "node:path";
import { buildsToday, committedTracker, DAILY_CAP, dispatch, ghEnabled, PAUSED_MESSAGE, pausedRecently, progress, runningJob } from "@/lib/github";

export const dynamic = "force-dynamic";

const clean = (t: string) => t.toUpperCase().replace(/[^A-Z0-9&-]/g, "");

function bundled(symbol: string) {
  const f = path.join(process.cwd(), "data", "promises", `${symbol}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}

const SYMBOL = /^[A-Z0-9&-]{1,20}$/;

/** Does screener.in know this exact symbol? (Fast search API, so bad tickers are rejected before any build.) */
async function exists(symbol: string): Promise<boolean> {
  try {
    const r = await fetch(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(symbol)}`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!r.ok) return true; // search unavailable: don't block a real ticker; the build itself will fail cleanly
    const hits = (await r.json()) as { url?: string }[];
    return hits.some((h) => (h.url ?? "").toUpperCase().includes(`/COMPANY/${symbol}/`));
  } catch {
    return true;
  }
}

/** GET: is a tracker ready? With ?req=<id>, the progress of an on-demand build. */
export async function GET(req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const raw = (await ctx.params).ticker.trim().toUpperCase();
  const symbol = clean(raw);
  if (!SYMBOL.test(raw) || symbol !== raw) return Response.json({ state: "rejected", message: `“${raw}” isn’t a valid NSE symbol.` });
  const id = new URL(req.url).searchParams.get("req");
  const ready = bundled(symbol) ?? (await committedTracker(symbol).catch(() => null));
  if (ready) return Response.json({ state: "ready", tracker: ready });
  if (!id) {
    if (!ghEnabled()) return Response.json({ state: "unavailable" });
    if (!(await exists(symbol))) return Response.json({ state: "rejected", message: `${symbol} isn’t a company FINN can find on screener.in.` });
    if (await pausedRecently().catch(() => false)) return Response.json({ state: "paused", message: PAUSED_MESSAGE });
    return Response.json({ state: "buildable" });
  }
  try {
    const p = await progress(id);
    if (p.state === "done") {
      const t = await committedTracker(symbol).catch(() => null);
      return Response.json(t ? { state: "ready", tracker: t } : { ...p, state: "running" }); // commit may lag the run by seconds
    }
    return Response.json(p);
  } catch (e) {
    return Response.json({ state: "running", stages: [], note: (e as Error).message });
  }
}

/** POST: start building a tracker for an unseen ticker, with guards (the button is public). */
export async function POST(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const raw = (await ctx.params).ticker.toUpperCase();
  const symbol = clean(raw);
  if (!SYMBOL.test(raw) || symbol !== raw) return Response.json({ state: "rejected", message: `“${raw}” isn’t a valid NSE symbol.` });
  if (bundled(symbol)) return Response.json({ state: "ready", tracker: bundled(symbol) });
  if (!ghEnabled()) return Response.json({ state: "unavailable" });
  try {
    const committed = await committedTracker(symbol).catch(() => null);
    if (committed) return Response.json({ state: "ready", tracker: committed });
    const running = await runningJob(symbol);
    if (running) return Response.json({ state: "queued", req: running, reused: true }); // someone already started it
    if (!(await exists(symbol))) return Response.json({ state: "rejected", message: `${symbol} isn’t a company FINN can find on screener.in.` });
    if (await pausedRecently().catch(() => false)) return Response.json({ state: "paused", message: PAUSED_MESSAGE });
    const today = await buildsToday();
    if (today >= DAILY_CAP) {
      return Response.json({ state: "capped", message: `Today’s ${DAILY_CAP} tracker builds are used up. Try again tomorrow; trackers already built still open instantly.` });
    }
    const id = Math.random().toString(36).slice(2, 10);
    await dispatch(symbol, id);
    return Response.json({ state: "queued", req: id, remaining: DAILY_CAP - today - 1 });
  } catch (e) {
    return Response.json({ state: "failed", note: (e as Error).message });
  }
}
