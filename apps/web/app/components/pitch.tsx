import { cn } from "@workspace/ui/lib/utils";

import type { Position } from "@/lib/lineup";
import { POSITIONS } from "@/lib/lineup";

/** Where each position sits on the pitch, as percentages. Attacking upward. */
const SPOTS: Record<Position, { left: number; top: number }> = {
  LF: { left: 20, top: 24 },
  CF: { left: 50, top: 17 },
  RF: { left: 80, top: 24 },
  LD: { left: 20, top: 62 },
  CD: { left: 50, top: 69 },
  RD: { left: 80, top: 62 },
  GK: { left: 50, top: 89 },
};

interface PitchProps {
  lineup: Record<Position, string>;
  /** Positions whose player changed since the previous section. */
  highlight?: Position[];
}

export function Pitch({ lineup, highlight = [] }: PitchProps) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-emerald-700 print:bg-emerald-100">
      <PitchMarkings />
      {POSITIONS.map((position) => {
        const spot = SPOTS[position];
        const isNew = highlight.includes(position);
        return (
          <div
            key={position}
            // The 42% cap is measured against the pitch, so a long name gets
            // ellipsized rather than spilling past the touchline.
            className="absolute flex max-w-[42%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
          >
            <span
              className={cn(
                "max-w-full truncate rounded-full bg-white px-2 py-0.5 text-[11px] leading-4 font-semibold text-neutral-900 shadow-sm",
                position === "GK" && "bg-amber-300",
                isNew &&
                  "ring-2 ring-white ring-offset-1 ring-offset-emerald-700"
              )}
              title={lineup[position]}
            >
              {lineup[position]}
            </span>
            <span className="text-[9px] leading-3 font-medium tracking-wide text-white/80 uppercase print:text-emerald-900">
              {position}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PitchMarkings() {
  const line = "absolute border-white/35 print:border-emerald-600/50";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={cn(line, "inset-[3%] rounded-sm border")} />
      <div className={cn(line, "top-1/2 right-[3%] left-[3%] border-t")} />
      <div
        className={cn(
          line,
          "top-1/2 left-1/2 w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border before:block before:pt-[100%]"
        )}
      />
      {/* Penalty areas */}
      <div
        className={cn(
          line,
          "top-[3%] left-1/2 h-[13%] w-[46%] -translate-x-1/2 border-x border-b"
        )}
      />
      <div
        className={cn(
          line,
          "bottom-[3%] left-1/2 h-[13%] w-[46%] -translate-x-1/2 border-x border-t"
        )}
      />
    </div>
  );
}
