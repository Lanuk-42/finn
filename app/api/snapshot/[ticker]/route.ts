import { fetchSnapshot } from "@/lib/screener";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  try {
    const snap = await fetchSnapshot(ticker);
    return Response.json(snap, { status: 200, headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" } });
  } catch (e) {
    return Response.json({ ok: false, symbol: ticker, error: `Fetch failed: ${(e as Error).message}` }, { status: 200 });
  }
}
