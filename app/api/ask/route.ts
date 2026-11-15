import { ask } from "@/lib/ask";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get("ticker") ?? "").toUpperCase();
  const q = (u.searchParams.get("q") ?? "").slice(0, 300);
  if (!symbol || !q.trim()) return Response.json({ found: false, reason: "ask a question about the selected company", searched: [] });
  return Response.json(ask(symbol, q));
}
