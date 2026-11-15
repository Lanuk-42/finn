"use client";

import type { Pattern, PromiseFile, Snapshot, Stock } from "@/lib/types";
import { bullBear, type Point } from "@/lib/bullbear";

// Bull vs bear: every line is a code template over a number FINN computed; tapping the source scrolls to that number.
export default function BullBear({ name, snap, pf, patterns, stock }: {
  name: string; snap: Snapshot | null; pf?: PromiseFile; patterns: Pattern[]; stock?: Stock;
}) {
  const { bull, bear } = bullBear(name, snap, pf, patterns, stock);
  if (!bull.length && !bear.length) return null;
  const go = (anchor: string) => {
    const el = document.getElementById(`src-${anchor}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("src-flash");
    setTimeout(() => el.classList.remove("src-flash"), 1600);
  };
  const Col = ({ title, pts, bad }: { title: string; pts: Point[]; bad?: boolean }) => (
    <div>
      <p className={`label !text-[10px] ${bad ? "!text-[var(--accent)]" : ""}`}>{title}</p>
      {pts.length === 0 && <p className="mt-1.5 text-[14px] text-[var(--muted)]">Nothing in the computed numbers clears the bar.</p>}
      <ol className="mt-1">
        {pts.map((p, i) => (
          <li key={i} className="border-b rule py-2.5">
            <p className="serif text-[16px] leading-snug">{p.text}</p>
            <button onClick={() => go(p.anchor)} className="mt-0.5 text-[12px] text-[var(--muted)] underline decoration-[var(--rule-strong)] underline-offset-2">
              {p.source} ↓
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between border-b border-[var(--rule-strong)] pb-1.5">
        <h2 className="label !text-[var(--ink)]">Bull vs bear</h2>
        <span className="text-[12px] text-[var(--muted)]">from FINN’s numbers, not a model</span>
      </div>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <Col title="For" pts={bull} />
        <Col title="Against" pts={bear} bad />
      </div>
    </section>
  );
}
