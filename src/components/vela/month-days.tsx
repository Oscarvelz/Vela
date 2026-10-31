import type { RatingStyle, WeekStart } from "@/lib/vela/catalog";
import type { CyclePhase } from "@/lib/vela/cycle";
import { RatingIcon } from "./ui";
import type { Lang } from "@/lib/vela/copy";
import { iso, monthMeta, todayStr, weekdayHeads } from "@/lib/vela/dates";
import { cn } from "@/lib/cn";

export function MonthDays({
  year,
  month,
  weekStart,
  lang,
  selected,
  counts,
  phases,
  marker,
  onPick,
}: {
  year: number;
  month: number;
  weekStart: WeekStart;
  lang: Lang;
  selected?: string;
  counts?: Record<string, number>;
  phases?: Record<string, CyclePhase>;
  marker: RatingStyle;
  onPick: (ds: string) => void;
}) {
  const heads = weekdayHeads(weekStart, lang);
  const { lead, days } = monthMeta(year, month, weekStart);
  const today = todayStr();
  const cells: Array<{ ds?: string; day?: number }> = [];
  for (let i = 0; i < lead; i++) cells.push({});
  for (let day = 1; day <= days; day++) cells.push({ day, ds: iso(year, month, day) });
  while (cells.length < 42) cells.push({});

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 border-b border-border pb-2 text-center text-[10px] font-semibold tracking-[0.16em] text-dim">
        {heads.map((head) => (
          <span key={head}>{head}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, index) => {
          if (!cell.ds || !cell.day) return <span key={`e${index}`} className="aspect-square" />;
          const count = counts?.[cell.ds] ?? 0;
          const phase = phases?.[cell.ds];
          const isSelected = cell.ds === selected;
          const isToday = cell.ds === today;
          return (
            <button
              key={cell.ds}
              type="button"
              onClick={() => onPick(cell.ds!)}
              aria-pressed={isSelected}
              aria-label={cell.ds}
              className="relative grid aspect-square place-items-center"
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full text-sm tabular-nums",
                  isToday &&
                    "bg-[color-mix(in_srgb,var(--ag-accent)_18%,transparent)] text-fg shadow-[inset_0_0_0_1.5px_var(--ag-accent)]",
                  isSelected && !isToday && "bg-accent text-on-accent",
                  count > 0 && !isSelected && !isToday && "bg-[color-mix(in_srgb,var(--ag-accent)_8%,transparent)]",
                )}
              >
                {cell.day}
              </span>
              {phase && phase !== "quiet" ? (
                <span
                  className={cn(
                    "absolute top-1 size-1.5 rounded-full",
                    phase === "period" && "bg-wine",
                    phase === "fertile" && "bg-accent",
                    phase === "ovulation" && "bg-accent shadow-[0_0_0_2px_color-mix(in_srgb,var(--ag-accent)_40%,transparent)]",
                  )}
                />
              ) : null}
              {count > 0 ? (
                <span className="absolute bottom-0 flex items-center text-accent">
                  <RatingIcon style={marker} className="size-2.5" />
                  {count > 1 ? <span className="text-[10px] tabular-nums">{count}</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
