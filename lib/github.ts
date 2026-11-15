// Server-only GitHub access for on-demand promise trackers. Token: FINN_GH_TOKEN (fine-grained, this repo, Actions: write,
// Contents: read). Without it, on-demand builds are simply unavailable; nothing else changes.
const REPO = process.env.FINN_GH_REPO || "Lanuk-42/finn";
const API = "https://api.github.com";

export const ghEnabled = () => !!process.env.FINN_GH_TOKEN;

async function gh(path: string, init: RequestInit = {}) {
  return fetch(`${API}/repos/${REPO}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${process.env.FINN_GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers || {}) },
  });
}

/** A tracker built by an earlier on-demand run (committed to main after this deploy was built). */
export async function committedTracker(symbol: string) {
  if (!ghEnabled()) return null;
  const r = await gh(`/contents/data/promises/${symbol}.json?ref=main`, { headers: { Accept: "application/vnd.github.raw+json" } });
  return r.ok ? await r.json() : null;
}

export async function dispatch(symbol: string, requestId: string) {
  const r = await gh(`/actions/workflows/promise.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main", inputs: { ticker: symbol, request_id: requestId } }) });
  if (!r.ok) throw new Error(`GitHub dispatch HTTP ${r.status}`);
  // GitHub lists a dispatched run only after a few seconds. Wait for it (up to ~12s) so the next click finds and reuses it.
  for (let i = 0; i < 8; i++) {
    await new Promise((res) => setTimeout(res, 1500));
    if ((await recentRuns(10)).some((x) => x.display_title.endsWith(` ${requestId}`))) return;
  }
}

export type Stage = { name: string; status: "pending" | "running" | "done" | "failed" };

/** Find the run for this request and turn its steps into stages. */
export async function progress(requestId: string) {
  const runs = await gh(`/actions/workflows/promise.yml/runs?event=workflow_dispatch&per_page=20`).then((r) => r.json());
  const run = (runs.workflow_runs ?? []).find((x: { display_title: string }) => x.display_title.endsWith(` ${requestId}`));
  if (!run) return { state: "queued" as const, stages: [] as Stage[] };
  const jobs = await gh(`/actions/runs/${run.id}/jobs`).then((r) => r.json());
  const steps: { name: string; status: string; conclusion: string | null }[] = jobs.jobs?.[0]?.steps ?? [];
  const stages: Stage[] = steps.filter((s) => s.name.startsWith("stage ")).map((s) => ({
    name: s.name.replace(/^stage \d: /, ""),
    status: s.conclusion === "failure" ? "failed" : s.status === "completed" ? "done" : s.status === "in_progress" ? "running" : "pending",
  }));
  if (run.status !== "completed") return { state: "running" as const, stages, url: run.html_url };
  return { state: run.conclusion === "success" ? ("done" as const) : ("failed" as const), stages, url: run.html_url };
}

export const DAILY_CAP = Number(process.env.FINN_BUILD_CAP || 10); // builds per IST day (env override only for testing)

type Run = { id: number; display_title: string; status: string; created_at: string; html_url: string };

async function recentRuns(perPage = 50): Promise<Run[]> {
  const j = await gh(`/actions/workflows/promise.yml/runs?per_page=${perPage}`).then((r) => r.json());
  return j.workflow_runs ?? [];
}

/** A build for this ticker that is still queued or running: reuse it instead of starting another. */
export async function runningJob(symbol: string): Promise<string | null> {
  const run = (await recentRuns(30)).find((r) => r.status !== "completed" && r.display_title.startsWith(`promise ${symbol} `));
  return run ? run.display_title.split(" ").pop() ?? null : null;
}

/** Builds started since midnight IST. The workflow's own run history is the counter: nothing else to store. */
export async function buildsToday(): Promise<number> {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600e3);
  const midnightIstUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600e3;
  return (await recentRuns(50)).filter((r) => new Date(r.created_at).getTime() >= midnightIstUtc).length;
}
