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
