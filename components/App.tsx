"use client";

import { useState } from "react";
import type { Brief as BriefT, PromiseFile } from "@/lib/types";
import Brief from "./Brief";
import Research from "./Research";

export default function App({ brief, promises }: { brief: BriefT; promises: PromiseFile[] }) {
  const [tab, setTab] = useState<"brief" | "research">("brief");
  const [researchTicker, setResearchTicker] = useState<string | null>(null);

  const openResearch = (sym: string) => {
    setResearchTicker(sym);
    setTab("research");
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-[560px] pb-20">
      {tab === "brief" ? (
        <Brief brief={brief} promises={promises} onOpenStock={openResearch} />
      ) : (
        <Research promises={promises} stocks={brief.stocks} initial={researchTicker} />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ink)] bg-[var(--paper)]">
        <div className="mx-auto grid max-w-[560px] grid-cols-2 px-5 pb-[max(env(safe-area-inset-bottom),10px)]">
          {(["brief", "research"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); window.scrollTo({ top: 0 }); }}
              aria-current={tab === t ? "page" : undefined}
              className={`-mt-px border-t-2 pt-2.5 pb-1 text-[12px] font-semibold uppercase tracking-[0.1em] ${tab === t ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--faint)]"}`}
            >
              {t === "brief" ? "Brief" : "Research"}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
