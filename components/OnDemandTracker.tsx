"use client";

import { useEffect, useRef, useState } from "react";
import type { PromiseFile } from "@/lib/types";

type Stage = { name: string; status: "pending" | "running" | "done" | "failed" };
type State =
  | { state: "loading" } | { state: "unavailable" } | { state: "buildable" }
  | { state: "queued" | "running"; req: string; stages: Stage[]; url?: string }
  | { state: "failed"; note?: string; url?: string } | { state: "ready"; tracker: PromiseFile }
  | { state: "capped" | "rejected" | "paused"; message: string };

const STAGES = ["fetch financial tables", "read earnings-call transcripts", "find guidance and check every quote", "save the tracker"];

/** For a ticker without a precomputed tracker: build one on GitHub Actions and show real progress. */
export default function OnDemandTracker({ ticker, name, render }: { ticker: string; name: string; render: (pf: PromiseFile) => React.ReactNode }) {
  const [s, setS] = useState<State>({ state: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    setS({ state: "loading" });
    // an invalid or unknown ticker: the snapshot above already says so, so no tracker block at all
    fetch(`/api/promise/${encodeURIComponent(ticker)}`).then((r) => r.json()).then((j) => {
      if (!live) return;
      if (j.state === "queued" && j.req) { setS({ state: "queued", req: j.req, stages: [] }); poll(j.req); return; }
      setS(j.state === "rejected" ? { state: "unavailable" } : j);
    }).catch(() => live && setS({ state: "unavailable" }));
    return () => { live = false; if (timer.current) clearTimeout(timer.current); };
  }, [ticker]);

  const poll = (req: string) => {
    fetch(`/api/promise/${encodeURIComponent(ticker)}?req=${req}`).then((r) => r.json()).then((j) => {
      if (j.state === "ready" || j.state === "failed" || j.state === "paused") return setS(j);
      setS({ state: j.state === "queued" ? "queued" : "running", req, stages: j.stages ?? [], url: j.url });
      timer.current = setTimeout(() => poll(req), 2000);
    }).catch(() => { timer.current = setTimeout(() => poll(req), 4000); });
  };

  const start = async () => {
    setS({ state: "queued", req: "", stages: [] });
    const j = await fetch(`/api/promise/${encodeURIComponent(ticker)}`, { method: "POST" }).then((r) => r.json()).catch(() => ({ state: "failed" }));
    if (j.state === "queued") { setS({ state: "queued", req: j.req, stages: [] }); poll(j.req); }
    else setS(j);
  };

  if (s.state === "ready") return <>{render(s.tracker)}</>;
  if (s.state === "loading" || s.state === "unavailable") return null;

  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between border-b border-[var(--rule-strong)] pb-1.5">
        <h2 className="label !text-[var(--ink)]">Promises vs delivery</h2>
        <span className="num text-[12px] text-[var(--muted)]">on demand</span>
      </div>
      {s.state === "buildable" && (
        <div className="py-4">
          <p className="serif text-[17px] leading-snug">FINN hasn’t scored {name}’s promises yet. It can read its last four earnings calls now.</p>
          <button onClick={start} className="mt-3 border border-[var(--ink)] px-3 py-1.5 text-[14px] font-semibold">Build {name}’s tracker → <span className="font-normal text-[var(--muted)]">about 2 minutes</span></button>
        </div>
      )}
      {(s.state === "queued" || s.state === "running") && (
        <ol className="py-3">
          {STAGES.map((label, i) => {
            const st = s.stages.find((x) => x.name === label)?.status ?? (s.state === "queued" && i === 0 ? "running" : "pending");
            return (
              <li key={label} className="flex items-baseline gap-3 border-b rule py-2 text-[15px]">
                <span className="num w-5 text-[var(--muted)]">{st === "done" ? "✓" : st === "running" ? "…" : st === "failed" ? "✕" : i + 1}</span>
                <span className={st === "pending" ? "text-[var(--faint)]" : st === "failed" ? "text-[var(--accent)]" : ""}>{label.charAt(0).toUpperCase() + label.slice(1)}</span>
              </li>
            );
          })}
          <li className="pt-2 text-[12px] text-[var(--muted)]">{s.state === "queued" ? "Waiting for a runner…" : "Running on GitHub Actions; the finished tracker is saved for everyone."}</li>
        </ol>
      )}
      {(s.state === "capped" || s.state === "rejected" || s.state === "paused") && <p className="serif py-4 text-[17px] leading-snug">{s.message}</p>}
      {s.state === "failed" && (
        <p className="serif py-4 text-[17px] leading-snug">Couldn’t build {name}’s tracker this time{s.note ? ` (${s.note})` : ""}.{" "}
          {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="link text-[15px]">See the run</a>}
        </p>
      )}
    </section>
  );
}
