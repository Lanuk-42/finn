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
    <div className="mx-auto min-h-dvh max-w-[560px] pb-24">
      {tab === "brief" ? (
        <Brief brief={brief} onOpenStock={openResearch} />
      ) : (
        <Research promises={promises} stocks={brief.stocks} initial={researchTicker} />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t hairline bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto grid max-w-[560px] grid-cols-2 px-4 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
          {(["brief", "research"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); window.scrollTo({ top: 0 }); }}
              className={`flex flex-col items-center gap-0.5 py-1.5 text-[13px] font-medium ${tab === t ? "text-[var(--ink)]" : "text-[var(--faint)]"}`}
            >
              <span className={`h-1 w-6 rounded-full ${tab === t ? "bg-[var(--ink)]" : "bg-transparent"}`} />
              {t === "brief" ? "Brief" : "Research"}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
