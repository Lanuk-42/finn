// Live screener.in fetch + parse for the Research tab (TypeScript port of scripts/finn/screener.py).
// Numbers are read from the page; every derived number (QoQ, YoY, margins) is computed here in code.
import * as cheerio from "cheerio";
import type { Line, Snapshot } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Table = { headers: string[]; rows: Record<string, (number | null)[]> };

function num(s: string): number | null {
  const t = s.replace(/[,%+]/g, "").trim();
  if (!t || t === "-" || t === "--") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function key(label: string): number {
  const m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(label);
  return m ? Number(m[2]) * 100 + MON.indexOf(m[1]) + 1 : 0;
}

function parseTable($: cheerio.CheerioAPI, id: string): Table | null {
  const t = $(`#${id} table.data-table`).first();
  if (!t.length) return null;
  const headers = t.find("thead th").map((_, th) => $(th).text().trim()).get().slice(1);
  const rows: Table["rows"] = {};
  t.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (!tds.length) return;
    const label = $(tds[0]).text().replace(/\+/g, "").replace(/\s+/g, " ").trim();
    if (label === "Raw PDF") return;
    rows[label] = tds.slice(1).map((_, td) => num($(td).text())).get() as (number | null)[];
  });
  return { headers, rows };
}

const pctCh = (c: number | null, b: number | null) => (c === null || b === null || b <= 0 ? null : Math.round(((c - b) / b) * 1000) / 10);
const margin = (n: number | null, d: number | null) => (n === null || !d ? null : Math.round((n / d) * 1000) / 10);

function latestKey(q: Table | null): number {
  if (!q) return 0;
  const hasData = Object.values(q.rows).some((r) => r.some((v) => v !== null));
  return hasData ? Math.max(...q.headers.map(key)) : 0;
}

/** Resolve a symbol or name that screener doesn't know directly (renamed companies, typed names) via its search. */
async function resolve(q: string): Promise<string | null> {
  const r = await fetch(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!r.ok) return null;
  const hits = (await r.json()) as { url?: string }[];
  const m = /\/company\/([^/]+)\//.exec(hits.find((h) => h.url)?.url ?? "");
  return m ? m[1].toUpperCase() : null;
}

export async function fetchSnapshot(symbolRaw: string, resolved = false): Promise<Snapshot> {
  const symbol = symbolRaw.toUpperCase().replace(/[^A-Z0-9&-]/g, "");
  if (!symbol) return { ok: false, symbol, error: "Enter an NSE ticker" };
  let best: { $: cheerio.CheerioAPI; q: Table | null; variant: string; url: string } | null = null;
  for (const [variant, path] of [["consolidated", `/company/${symbol}/consolidated/`], ["standalone", `/company/${symbol}/`]] as const) {
    const url = `https://www.screener.in${path}`;
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store" });
    if (r.status === 404) continue;
    if (!r.ok) return { ok: false, symbol, error: `screener.in answered HTTP ${r.status}` };
    const $ = cheerio.load(await r.text());
    const q = parseTable($, "quarters");
    if (!best || latestKey(q) > latestKey(best.q)) best = { $, q, variant, url };
    // consolidated is current (within ~7 months)? then skip standalone
    const d = new Date(); d.setMonth(d.getMonth() - 7);
    if (variant === "consolidated" && latestKey(q) >= d.getFullYear() * 100 + d.getMonth() + 1) break;
  }
  if (!best || !best.q || latestKey(best.q) === 0) {
    if (!resolved) {
      const alt = await resolve(symbolRaw);
      if (alt && alt !== symbol) {
        const s = await fetchSnapshot(alt, true);
        return s.ok ? { ...s, symbol: alt, name: `${s.name} (searched “${symbol}”)` } : s;
      }
    }
    return { ok: false, symbol, error: `No quarterly results found for ${symbol} on screener.in` };
  }

  const { $, q, variant, url } = best;
  const ratios: Record<string, string> = {};
  $("#top-ratios li").each((_, li) => {
    const n = $(li).find(".name").text().trim();
    const v = $(li).find(".value").text().replace(/\s+/g, " ").trim();
    if (n && v) ratios[n] = v;
  });
  const rows = q.rows;
  const isBank = "Financing Profit" in rows;
  const series = {
    revenue: rows["Sales"] ?? rows["Revenue"] ?? null,
    ebitda: isBank ? null : rows["Operating Profit"] ?? null,
    pbt: rows["Profit before tax"] ?? null,
    pat: rows["Net Profit"] ?? null,
  };
  const i = q.headers.length - 1;
  const line = (s: (number | null)[] | null): Line | null =>
    s ? { value: s[i], prev: s[i - 1] ?? null, year_ago: s[i - 4] ?? null, qoq: pctCh(s[i], s[i - 1] ?? null), yoy: pctCh(s[i], s[i - 4] ?? null) } : null;
  const trend = q.headers.slice(-8).map((h) => {
    const j = q.headers.indexOf(h);
    return { quarter: h, revenue: series.revenue?.[j] ?? null, margin: series.ebitda && series.revenue ? margin(series.ebitda[j], series.revenue[j]) : null };
  });
  return {
    ok: true, symbol, variant, url,
    name: $("h1").first().text().trim(),
    about: $("div.about").first().text().replace(/\s+/g, " ").trim() || null,
    ratios,
    fetched_at: new Date().toISOString(),
    latest: {
      quarter: q.headers[i], prev: q.headers[i - 1] ?? null, year_ago: q.headers[i - 4] ?? null, is_bank: isBank,
      lines: { revenue: line(series.revenue), ebitda: line(series.ebitda), pbt: line(series.pbt), pat: line(series.pat) },
      ebitda_margin: series.ebitda && series.revenue ? margin(series.ebitda[i], series.revenue[i]) : null,
      ebitda_margin_ya: series.ebitda && series.revenue && i >= 4 ? margin(series.ebitda[i - 4], series.revenue[i - 4]) : null,
    },
    trend,
  };
}
