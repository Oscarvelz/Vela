import { useRef, useState } from "react";
import { fmtDate, iso, monthHeading, todayStr } from "@/lib/vela/dates";
import { cycleMarks } from "@/lib/vela/cycle";
import { useLang, useT } from "@/lib/vela/i18n";
import { sessionsSorted } from "@/lib/vela/stats";
import { selectActiveCycle, useJournal } from "@/lib/vela/store";
import { MonthDays } from "./month-days";
import { SessionCard } from "./session-card";
import { CycleDayPanel, CycleLegend } from "./cycle-card";
import { Button, Card } from "./ui";
import { cn } from "@/lib/cn";

function neighbor(year: number, month: number, delta: number) {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function CalendarView() {
  const t = useT();
  const lang = useLang();
  const year = useJournal((s) => s.calY);
  const month = useJournal((s) => s.calM);
  const selected = useJournal((s) => s.calSel);
  const weekStart = useJournal((s) => s.journal.settings.weekStart);
  const ratingStyle = useJournal((s) => s.journal.settings.ratingStyle);
  const sessions = useJournal((s) => s.journal.sessions);
  const cycle = useJournal(selectActiveCycle);
  const shift = useJournal((s) => s.shiftMonth);
  const goToToday = useJournal((s) => s.goToToday);
  const pick = useJournal((s) => s.pickDay);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, y: 0, id: -1, axis: "" as "" | "x" | "y" });
  const skipClick = useRef(false);
  const token = useRef(0);
  const timer = useRef(0);
  const frameId = useRef(0);
  const latest = useRef(0);
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);
  const counts: Record<string, number> = {};
  for (const session of sessions) counts[session.date] = (counts[session.date] ?? 0) + 1;
  const active = Object.keys(counts).length;
  const daySessions = sessionsSorted(sessions).filter((session) => session.date === selected);
  const now = todayStr();
  const onThisMonth = `${year}-${String(month + 1).padStart(2, "0")}` === now.slice(0, 7);
  const panes = [neighbor(year, month, -1), { year, month }, neighbor(year, month, 1)];

  function settle(dir: -1 | 0 | 1) {
    window.clearTimeout(timer.current);
    window.cancelAnimationFrame(frameId.current);
    frameId.current = 0;
    const mark = ++token.current;
    const width = frame.current?.clientWidth || 1;
    setSliding(true);
    setOffset(dir === 0 ? 0 : dir < 0 ? width : -width);
    timer.current = window.setTimeout(() => {
      if (token.current !== mark) return;
      if (dir !== 0) shift(dir);
      setSliding(false);
      setOffset(0);
    }, 220);
  }

  function follow(px: number) {
    latest.current = px;
    if (frameId.current) return;
    frameId.current = window.requestAnimationFrame(() => {
      frameId.current = 0;
      setOffset(latest.current);
    });
  }

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
      <Card className="px-4 py-5">
        <button
          type="button"
          className={cn(
            "mb-3 block w-full whitespace-nowrap text-center font-display text-[1.85rem] leading-none",
            onThisMonth ? "text-fg" : "text-accent",
          )}
          onClick={() => {
            if (!onThisMonth) goToToday();
          }}
        >
          {monthHeading(year, month, lang)}
        </button>
        <div
          ref={frame}
          className="overflow-hidden"
          data-noswipe
          style={{ touchAction: "pan-y" }}
          onPointerDown={(event) => {
            token.current += 1;
            window.clearTimeout(timer.current);
            window.cancelAnimationFrame(frameId.current);
            frameId.current = 0;
            setSliding(false);
            drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, axis: "" };
            frame.current?.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current.id !== event.pointerId) return;
            const dx = event.clientX - drag.current.x;
            const dy = event.clientY - drag.current.y;
            if (!drag.current.axis) {
              if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
              drag.current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            }
            if (drag.current.axis !== "x") return;
            follow(dx);
          }}
          onPointerUp={(event) => {
            if (drag.current.id !== event.pointerId) return;
            const dx = event.clientX - drag.current.x;
            const horizontal = drag.current.axis === "x";
            drag.current.id = -1;
            if (frame.current?.hasPointerCapture(event.pointerId)) frame.current.releasePointerCapture(event.pointerId);
            if (!horizontal) {
              settle(0);
              return;
            }
            if (Math.abs(dx) > 10) {
              skipClick.current = true;
              window.setTimeout(() => {
                skipClick.current = false;
              }, 80);
            }
            const width = frame.current?.clientWidth || 1;
            settle(Math.abs(dx) > Math.max(48, width * 0.18) ? (dx < 0 ? 1 : -1) : 0);
          }}
          onPointerCancel={(event) => {
            if (drag.current.id !== event.pointerId) return;
            drag.current.id = -1;
            settle(0);
          }}
        >
          <div
            className={cn("flex w-[300%] items-start", sliding && "transition-transform duration-200 ease-out")}
            style={{ transform: `translateX(calc(-33.333% + ${offset}px))` }}
          >
            {panes.map((pane) => (
              <div key={`${pane.year}-${pane.month}`} className="w-1/3 shrink-0">
                <MonthDays
                  year={pane.year}
                  month={pane.month}
                  weekStart={weekStart}
                  lang={lang}
                  selected={selected}
                  counts={counts}
                  marks={cycle.enabled ? cycleMarks(cycle, iso(pane.year, pane.month, 1), iso(pane.year, pane.month, 31), now) : undefined}
                  marker={ratingStyle}
                  onPick={(ds) => {
                    if (skipClick.current) return;
                    pick(ds);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] leading-snug text-dim">{t("swipeMonths")}</p>
        {cycle.enabled && cycle.starts.length > 0 ? <CycleLegend /> : null}
        <div className="cal-stats mt-4 grid grid-cols-2 border-t border-border pt-3" data-testid="cal-stats">
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-display text-[1.6rem] leading-none text-fg tabular-nums">{sessions.length}</span>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-dim">{t("totalSessionsL")}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 border-l border-border">
            <span className="font-display text-[1.6rem] leading-none text-fg tabular-nums">{active}</span>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-dim">{t("activeDaysL")}</span>
          </div>
        </div>
      </Card>
      <div className="mt-5 lg:mt-0">
        <h2 className="mb-3 font-display text-3xl">{fmtDate(selected, lang)}</h2>
        <CycleDayPanel date={selected} />
        {daySessions.length === 0 ? (
          <Card className="py-8 text-center">
            <p className="font-display text-2xl">{t("noSessionsDay")}</p>
            <p className="mt-2 text-sm leading-relaxed text-dim">{t("noSessionsDayBody")}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {daySessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
