import fs from "node:fs";
import path from "node:path";
import { committedTracker, dispatch, ghEnabled, progress } from "@/lib/github";

export const dynamic = "force-dynamic";

const clean = (t: string) => t.toUpperCase().replace(/[^A-Z0-9&-]/g, "");

function bundled(symbol: string) {
  const f = path.join(process.cwd(), "data", "promises", `${symbol}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}

/** GET: is a tracker ready? With ?req=<id>, the progress of an on-demand build. */
export async function GET(req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const symbol = clean((await ctx.params).ticker);
  const id = new URL(req.url).searchParams.get("req");
  const ready = bundled(symbol) ?? (await committedTracker(symbol).catch(() => null));
  if (ready) return Response.json({ state: "ready", tracker: ready });
  if (!id) return Response.json({ state: ghEnabled() ? "buildable" : "unavailable" });
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

/** POST: start building a tracker for an unseen ticker. */
export async function POST(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const symbol = clean((await ctx.params).ticker);
  if (bundled(symbol)) return Response.json({ state: "ready", tracker: bundled(symbol) });
  if (!ghEnabled()) return Response.json({ state: "unavailable" });
  const id = Math.random().toString(36).slice(2, 10);
  try {
    await dispatch(symbol, id);
    return Response.json({ state: "queued", req: id });
  } catch (e) {
    return Response.json({ state: "failed", note: (e as Error).message });
  }
}
