import { askAny } from "@/lib/ask";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // an unseen ticker's transcripts are downloaded and read on first use

const SYMBOL = /^[A-Z0-9&-]{1,20}$/;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get("ticker") ?? "").toUpperCase();
  const q = (u.searchParams.get("q") ?? "").slice(0, 300);
  if (!SYMBOL.test(symbol) || !q.trim()) return Response.json({ found: false, reason: "ask a question about the selected company", searched: [] });
  try {
    const a = await askAny(symbol, q);
    return Response.json(a, { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return Response.json({ found: false, reason: `the transcripts couldn’t be read right now (${(e as Error).message})`, searched: [] });
  }
}
