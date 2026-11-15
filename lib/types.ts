export type Tier = "Act" | "Note" | "Routine";

export interface Line { value: number | null; prev: number | null; year_ago: number | null; qoq: number | null; yoy: number | null }

export interface ResultsCard {
  type: "results";
  status: "ok" | "pending";
  quarter: string;
  note?: string;
  is_bank?: boolean;
  prev_quarter?: string | null;
  year_ago?: string | null;
  lines?: { revenue: Line | null; ebitda: Line | null; pbt: Line | null; pat: Line | null };
  ebitda_margin?: { value: number | null; prev: number | null; year_ago: number | null; qoq_pp: number | null; yoy_pp: number | null };
  raw_pdf?: string | null;
  filing_url?: string | null;
  why_act?: string[];
  filing_check?: {
    status: "matched" | "mismatch" | "fallback" | "screener_only"; reason?: string; unit?: string; pages?: number[]; checked?: number;
    lines?: Record<string, { filing: number; screener: number | null; match: boolean; quote: string; derived?: boolean }>;
  };
}

export interface Person {
  name: string; role: string; change: "joined" | "left" | "reappointed" | "redesignated";
  effective_date: string | null; evidence: string; tenure: string | null; bio: string | null;
}
export interface MgmtCard { type: "management"; people: Person[]; dropped?: number; note?: string }

export interface Filing {
  id: string; symbol: string; ts: string; title: string; headline: string; url: string | null; source: string;
  category: string; tier: Tier; rule: string; basis: string; card?: ResultsCard | MgmtCard; folded_into?: string;
}

export interface Thesis {
  why: string; metric: string; op: string; value: number; rule: string;
  actual: number | null; quarter: string | null; status: "ok" | "breach" | "n/a";
}

export interface Stock {
  symbol: string; name: string; sector: string; cap: string; thesis: Thesis;
  close: number; date: string; day_pct: number;
  metrics?: Record<string, number | null>; metrics_quarter?: string | null;
}

export interface MoveRow { date: string; close: number; pct: number; volx: number | null; filings: string[]; explained: boolean }

export interface Brief {
  generated_at: string; data_as_of: string; latest_trading_day: string;
  fetch: Record<string, { announcements: string | null; prices: boolean; screener: boolean }>;
  act_order: string[]; stocks: Stock[]; filings: Filing[]; moves: Record<string, MoveRow[]>;
  patterns?: Pattern[];
}

export interface Promise_ {
  metric: string; scope: string; period: string; kind: string; low: number | null; high: number | null;
  unit: string; summary: string; speaker: string | null; quote: string; call: string; source_url: string;
  status: "resolved" | "in_progress" | "standing" | "not_checkable" | "rejected";
  verdict?: "Beat" | "Met" | "Missed"; actual?: number | null; tracking?: number; basis?: string; base?: string;
  reason?: string; qualifier?: string | null;
  checks?: { quarter: string; value: number; verdict: string }[]; held?: number; tested?: number;
  followups: { call: string; quote: string; low: number | null; high: number | null; kind: string; source_url: string }[];
}

export interface PromiseFile {
  symbol: string; company: string; generated_at: string;
  transcripts: { label: string; quarter?: string; quarter_basis?: string; url: string; status: string }[];
  promises: Promise_[]; not_checkable: Promise_[]; rejected: Promise_[];
  credibility: { kept: number; resolved: number; in_progress: number; standing: number };
}

export interface Snapshot {
  ok: boolean; error?: string; symbol: string; name?: string; variant?: string; url?: string; fetched_at?: string;
  about?: string | null; ratios?: Record<string, string>;
  latest?: { quarter: string; prev: string | null; year_ago: string | null; is_bank: boolean;
    lines: Record<"revenue" | "ebitda" | "pbt" | "pat", Line | null>; ebitda_margin: number | null; ebitda_margin_ya: number | null };
  trend?: { quarter: string; revenue: number | null; margin: number | null }[];
  extras?: import("./extras").Extras;
  stale?: boolean;
}

export interface Pattern { symbol: string; kind: "credit" | "exits" | "pledging"; severity: "flag" | "info"; lead: string; filings: string[] }
