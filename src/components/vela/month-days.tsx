import type { RatingStyle, WeekStart } from "@/lib/vela/catalog";
import type { DayMark } from "@/lib/vela/cycle";
import { cycleMarkClass } from "./cycle-card";
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
  marks,
  marker,
  onPick,
}: {
  year: number;
  month: number;
  weekStart: WeekStart;
  lang: Lang;
  selected?: string;
  counts?: Record<string, number>;
  marks?: Record<string, DayMark>;
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
          const mark = marks?.[cell.ds];
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
                  "cy-week-num grid size-9 place-items-center rounded-full text-sm tabular-nums",
                  !isSelected && cycleMarkClass(mark),
                  isToday && !mark && "bg-[color-mix(in_srgb,var(--ag-accent)_18%,transparent)] text-fg",
                  isToday && "cy-today-ring",
                  isSelected && "bg-accent font-semibold text-on-accent",
                  count > 0 && !isSelected && !isToday && !mark && "bg-[color-mix(in_srgb,var(--ag-accent)_8%,transparent)]",
                )}
              >
                {cell.day}
              </span>
              {mark?.start ? <span className="cy-bg-period absolute top-1 size-1.5 rounded-full" aria-hidden /> : null}
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
