"use client";

/** "Start here" callout: one plain line, one action, a step count and Skip. */
export default function Callout({ step, text, action, onAction, onSkip }: {
  step: number; text: string; action?: string; onAction?: () => void; onSkip: () => void;
}) {
  return (
    <div role="note" className="my-3 border-l-[3px] border-[var(--ink)] bg-[var(--sheet)] px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="label !text-[10px] !text-[var(--ink)]">Start here · {step} of 3</span>
        <button onClick={onSkip} className="text-[12px] text-[var(--muted)] underline underline-offset-2">Skip</button>
      </div>
      <p className="serif mt-1 text-[16px] leading-snug">{text}</p>
      {action && onAction && (
        <button onClick={onAction} className="mt-2 border border-[var(--ink)] px-2.5 py-1 text-[13px] font-semibold">{action} →</button>
      )}
    </div>
  );
}
