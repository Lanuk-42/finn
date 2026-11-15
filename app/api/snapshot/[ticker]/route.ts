import { fetchSnapshot } from "@/lib/screener";
import { savedSnapshot } from "@/lib/saved";

export const dynamic = "force-dynamic";

/** Live from screener.in; if that fails (network, block, HTTP error), the last saved copy, marked stale. */
export async function GET(req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const forceOffline = new URL(req.url).searchParams.get("offline") === "1"; // lets us test the fallback path
  try {
    if (forceOffline) throw new Error("offline test");
    const snap = await fetchSnapshot(ticker);
    if (snap.ok) return Response.json(snap, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" } });
    return Response.json(savedSnapshot(ticker) ?? snap);
  } catch (e) {
    const saved = savedSnapshot(ticker);
    if (saved) return Response.json(saved);
    return Response.json({ ok: false, symbol: ticker, stale: true, error: `screener.in is unreachable right now (${(e as Error).message}) and FINN has no saved copy of ${ticker.toUpperCase()}.` });
  }
}
