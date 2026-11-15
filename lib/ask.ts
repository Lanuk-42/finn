// Ask bar, code only: find the transcript passage that answers a question and return it verbatim with call + page,
// or refuse. No model writes the answer, so every answer is a real quote by construction.
import fs from "node:fs";
import path from "node:path";

type Call = { quarter: string; label: string; url: string; pages: string[] };
export type Answer =
  | { found: true; quote: string; quarter: string; page: number; url: string; score: number; matched: string[]; searched: string[] }
  | { found: false; reason: string; searched: string[] };

const STOP = new Set(("a an the of to in on for and or is are was were be been being what which who whom whose when where why how " +
  "does do did can could would should will shall may might must has have had it its this that these those there their they them " +
  "you your we our us i me my about any some much many more most give tell me please company management say said says " +
  "expect expected plan planned guide outlook view comment comments update latest current next big large").split(" "));
// Intent words matter but are too common to anchor a match on their own.
const SOFT = new Set(["guidance", "guide", "target", "outlook", "expect", "plan", "next", "year", "quarter", "growth", "rate", "level", "number"]);
const FORWARD = /\b(guidance|guided|we expect|expect|target|aspire|aspiration|will be|we will|going to|confident|should be|aim|by fy|next year|this year)\b/i;
const ANALYST = /\b(your|you have|you are|you said|i understand|my question|can you|could you)\b/i;
const FIGURE_TOK = /^\d[\d,.]*%?$/;
const SYN: Record<string, string[]> = {
  margin: ["margin", "margins"], margins: ["margin", "margins"], ebitda: ["ebitda"], ebit: ["ebit"],
  revenue: ["revenue", "revenues", "sales", "turnover", "topline"], sales: ["sales", "revenue", "turnover"],
  capex: ["capex"], debt: ["debt", "borrowing", "borrowings", "leverage"],
  dividend: ["dividend", "payout"], orders: ["order", "orders", "inflow", "orderbook"], order: ["order", "orders", "inflow", "orderbook"],
  export: ["export", "exports"], exports: ["export", "exports"], hiring: ["hiring", "headcount", "employees"],
  attrition: ["attrition"], acquisition: ["acquisition", "acquire", "acquired"], tax: ["tax"],
  guidance: ["guidance", "guided", "guide", "expect", "target"], growth: ["growth", "grow", "growing"],
};
const NUMERIC = /\b(how much|how many|how big|target|guidance|margin|growth|capex|percent|crore|rate|size)\b|%/i;
// A numeric question is only answered by a passage that states a number with a unit.
const HAS_FIGURE = /\d[\d,.]*\s*(%|percent|crores?|cr\b|billion|bn\b|million|mn\b|bps|basis points|x\b|times)/i;
const isPeriod = (t: string) => /^fy\d{2,4}$|^h[12]$|^q[1-4]$|^20\d\d$/.test(t);

const tok = (s: string) => s.toLowerCase().replace(/[^a-z0-9%.\s-]/g, " ").split(/\s+/).map((w) => w.replace(/^[.-]+|[.-]+$/g, "")).filter(Boolean);

export function loadCalls(symbol: string): Call[] {
  const f = path.join(process.cwd(), "data", "transcripts", `${symbol.toUpperCase().replace(/[^A-Z0-9&-]/g, "")}.json`);
  if (!fs.existsSync(f)) return [];
  return (JSON.parse(fs.readFileSync(f, "utf8")) as { calls: Call[] }).calls;
}

// ---- on demand: any other ticker's latest transcripts, read live from the links screener lists (BSE copies first)
const LIVE = new Map<string, { at: number; calls: Call[] }>(); // per server instance; the API response is CDN-cached too
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function quarterOf(text: string, label: string): string {
  const m = /\bQ\s*([1-4])\s*(?:FY|F\.Y\.)\s*'?\s*(\d{2,4})/i.exec(text.slice(0, 8000));
  return m ? `Q${m[1]}FY${String(Number(m[2]) % 100).padStart(2, "0")}` : label;
}

async function pdfPages(url: string): Promise<string[] | null> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  if (String.fromCharCode(...buf.slice(0, 4)) !== "%PDF") return null;
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(buf), { mergePages: false });
  return (text as string[]).slice(0, 80).map((t) => t.split(/\s+/).join(" ").trim());
}

export async function liveCalls(symbol: string, want = 2): Promise<Call[]> {
  const hit = LIVE.get(symbol);
  if (hit && Date.now() - hit.at < 12 * 3600e3) return hit.calls;
  const cheerio = await import("cheerio");
  let links: { label: string; url: string }[] = [];
  for (const p of [`/company/${symbol}/consolidated/`, `/company/${symbol}/`]) {
    const r = await fetch(`https://www.screener.in${p}`, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!r.ok) continue;
    const $ = cheerio.load(await r.text());
    links = $("a[title='Raw Transcript']").map((_, a) => ({ label: $(a).closest("li").find("div").first().text().trim(), url: $(a).attr("href") ?? "" })).get();
    if (links.length) break;
  }
  const seen = new Set<string>(), calls: Call[] = [];
  for (const l of links) {
    if (!l.url || seen.has(l.url)) continue;
    seen.add(l.url);
    const pages = await pdfPages(l.url).catch(() => null);
    if (!pages || pages.join("").length < 5000) continue;
    const quarter = quarterOf(pages.join(" "), l.label);
    if (calls.some((c) => c.quarter === quarter)) continue;
    calls.push({ quarter, label: l.label, url: l.url, pages });
    if (calls.length >= want || seen.size >= want + 3) break;
  }
  LIVE.set(symbol, { at: Date.now(), calls });
  return calls;
}

export async function askAny(symbol: string, question: string): Promise<Answer & { live?: boolean }> {
  const bundled = loadCalls(symbol);
  if (bundled.length) return ask(symbol, question, bundled);
  const calls = await liveCalls(symbol);
  if (!calls.length) return { found: false, reason: "no readable earnings-call transcripts are listed for this company", searched: [], live: true };
  return { ...ask(symbol, question, calls), live: true };
}

export function ask(symbol: string, question: string, given?: Call[]): Answer {
  const calls = given ?? loadCalls(symbol);
  const searched = calls.map((c) => c.quarter);
  if (!calls.length) return { found: false, reason: "no transcripts on file for this company", searched };

  const qTerms = [...new Set(tok(question).filter((w) => !STOP.has(w) && w.length > 1))];
  const groups = qTerms.map((t) => ({
    t,
    alts: SYN[t] ?? (isPeriod(t) ? [t, t.replace(/^fy/, "fy")] : [t, t.endsWith("s") ? t.slice(0, -1) : t + "s"]),
    soft: SOFT.has(t) || isPeriod(t), // a fiscal-year word helps ranking but transcripts write it too many ways to require it
  }));
  const hard = groups.filter((g) => !g.soft);
  if (!hard.length) return { found: false, reason: "the question has no specific subject to look for", searched };

  // Passages: contiguous 2-sentence windows on each page (contiguous, so the quote is an exact substring).
  type P = { text: string; call: Call; page: number; words: string[] };
  const passages: P[] = [];
  for (const c of calls) {
    c.pages.forEach((pg, i) => {
      const sents = pg.split(/(?<=[.?!])\s+(?=[A-Z"“])/);
      for (let k = 0; k < sents.length; k++) {
        const text = sents.slice(k, k + 2).join(" ");
        if (text.length < 40) continue;
        passages.push({ text, call: c, page: i + 1, words: tok(text.replace(/fy\s*'?\s*(\d{2})/gi, "fy$1")) });
      }
    });
  }
  const numeric = NUMERIC.test(question);
  const N = passages.length;
  const df = (alts: string[]) => passages.filter((p) => alts.some((a) => p.words.includes(a))).length;
  const idf = Object.fromEntries(groups.map((g) => [g.t, Math.log(1 + N / (1 + df(g.alts)))]));
  const recency = Object.fromEntries(calls.map((c, i) => [c.quarter, 1 - i * 0.04])); // newer calls first in the file

  let best: { p: P; score: number; matched: string[] } | null = null;
  for (const p of passages) {
    const matched = groups.filter((g) => g.alts.some((a) => p.words.includes(a)));
    const hardHit = matched.filter((g) => !g.soft).length;
    // every specific term must appear (one may be missing if the question has 3+)
    if (hardHit < Math.max(1, hard.length - (hard.length >= 3 ? 1 : 0))) continue;
    if (numeric && !HAS_FIGURE.test(p.text)) continue;
    if (numeric) {
      // the figure must sit close to what was asked about (within 12 words of a specific term)
      const hardPos = p.words.flatMap((w, i) => (hard.some((g) => g.alts.includes(w)) ? [i] : []));
      const figPos = p.words.flatMap((w, i) => (FIGURE_TOK.test(w) ? [i] : []));
      if (!hardPos.some((h) => figPos.some((f) => Math.abs(f - h) <= 12))) continue;
    }
    let score = matched.reduce((a, g) => a + idf[g.t] * (g.soft ? 0.4 : 1), 0);
    if (FORWARD.test(p.text) && /guid|target|expect|plan|outlook|will|next|fy\d/i.test(question)) score *= 1.25;
    // the question's words kept together as a phrase ("revenue growth", "order book") is strong evidence
    const lower = " " + p.words.join(" ") + " ";
    for (let k = 0; k + 1 < groups.length; k++) {
      if (groups[k].alts.some((a) => groups[k + 1].alts.some((b) => lower.includes(` ${a} ${b} `)))) score *= 1.5;
    }
    if (p.text.includes("?")) score *= 0.5; // an analyst asking is not an answer
    if (ANALYST.test(p.text)) score *= 0.6; // nor is an analyst paraphrasing management
    score *= recency[p.call.quarter] ?? 1;
    if (!best || score > best.score) best = { p, score, matched: matched.map((g) => g.t) };
  }
  const total = hard.reduce((a, g) => a + idf[g.t], 0);
  if (!best || best.score < Math.max(2.5, 0.75 * total)) {
    return { found: false, reason: "no passage in these calls answers it", searched };
  }
  // Verified quote: the passage text is an exact substring of the page it came from.
  const pageText = best.p.call.pages[best.p.page - 1];
  if (!pageText.includes(best.p.text)) return { found: false, reason: "quote failed verification", searched };
  return { found: true, quote: best.p.text, quarter: best.p.call.quarter, page: best.p.page, url: best.p.call.url, score: Math.round(best.score * 10) / 10, matched: best.matched, searched };
}
