import { useMemo, useRef, useState } from "react";
import { Check, Droplet, RotateCcw, Settings2, X } from "lucide-react";
import {
  cycleMarks,
  cycleSnapshot,
  cycleStats,
  dayInfo,
  libidoByPhase,
  pastCycles,
  periodContaining,
  sessionsByPhase,
  type CyclePhase,
  type CycleStage,
  type DayMark,
} from "@/lib/vela/cycle";
import type { CopyKey } from "@/lib/vela/copy";
import { fill, stageKey, useCycleWords } from "@/lib/vela/cycle-words";
import { addDays, fmtShort, parseDate, todayStr } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import { cn } from "@/lib/cn";
import { Button, Card, fieldClass } from "./ui";

const PHASE_KEY: Record<CyclePhase, CopyKey> = {
  period: "cyclePeriod",
  fertile: "cycleFertile",
  ovulation: "cycleOvulation",
  quiet: "cycleQuiet",
};

export function phaseKey(phase: CyclePhase) {
  return PHASE_KEY[phase];
}

/** Background class for a small phase / stage dot. */
export function stageDot(stage: CycleStage | CyclePhase) {
  if (stage === "period") return "cy-bg-period";
  if (stage === "fertile") return "cy-bg-fertile";
  if (stage === "ovulation") return "cy-bg-ovulation";
  if (stage === "late") return "cy-bg-late";
  return "cy-bg-quiet";
}

function markClass(mark: DayMark | undefined) {
  if (!mark) return "";
  if (mark.phase === "period") return mark.predicted ? "cy-mark-period-pred" : "cy-mark-period";
  if (mark.phase === "ovulation") return "cy-mark-ovulation";
  if (mark.phase === "fertile") return "cy-mark-fertile";
  return "";
}

export { markClass as cycleMarkClass };

/* ── Home card ──────────────────────────────────────────────────────────── */

export function CycleCard({ inSheet = false, onClose }: { inSheet?: boolean; onClose?: () => void }) {
  const { t, w, partner } = useCycleWords();
  const lang = useLang();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const setCycle = useJournal((s) => s.setCycle);
  const logPeriodStart = useJournal((s) => s.logPeriodStart);
  const setPeriodEnd = useJournal((s) => s.setPeriodEnd);
  const openCycleDay = useJournal((s) => s.openCycleDay);
  const showToast = useJournal((s) => s.showToast);
  const [tune, setTune] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const today = todayStr();

  if (!cycle.enabled) {
    return (
      <div className="ag-panel rounded-card border border-border px-4 py-4" id="cycle-card">
        <p className="flex items-center gap-2 font-display text-2xl">
          <span className="cy-bg-period size-2.5 rounded-full" />
          {t("cycleTitle")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-dim">{t("cycleBody")}</p>
        <Button className="mt-3" onClick={() => setCycle({ enabled: true })}>
          {t("cycleEnable")}
        </Button>
      </div>
    );
  }

  const snap = cycleSnapshot(cycle, today);
  if (!snap.hasStarts) return <FirstStart />;

  const keyLine = dialLine(snap, today, t);
  const stats = cycleStats(cycle);
  const primary = snap.periodOpen
    ? {
        label: w("cyPeriodEnded"),
        run: () => {
          if (snap.cycleStart) setPeriodEnd(snap.cycleStart, today);
          showToast(t("cyEndToast"));
        },
      }
    : {
        label: w("cyPeriodStarted"),
        run: () => {
          logPeriodStart(today);
          showToast(t("cyStartToast"));
        },
      };

  return (
    <div className={cn(!inSheet && "ag-panel rounded-card border border-border px-4 py-4")} id={inSheet ? undefined : "cycle-card"} data-testid="cycle-card">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.16em] text-dim uppercase">{w("cyTitle")}</p>
        <RegularityBadge regularity={stats.regularity} />
        <button
          type="button"
          className={cn("grid size-8 shrink-0 place-items-center rounded-full text-dim", tune && "text-accent")}
          aria-label={t("cyAdjustCycle")}
          aria-expanded={tune}
          onClick={() => setTune((open) => !open)}
        >
          <Settings2 className="size-4" />
        </button>
        {onClose ? (
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full text-dim" aria-label={t("closeEdit")} onClick={onClose}>
            <X className="size-5" />
          </button>
        ) : null}
      </div>
      <CycleDial snap={snap} keyLine={keyLine} />
      <div className={cn("mt-4 grid gap-2", partner ? "grid-cols-1" : "grid-cols-[1fr_auto]")}>
        <Button className="w-full" onClick={primary.run} data-testid="cycle-primary">
          <Droplet className="size-4" aria-hidden />
          {primary.label}
        </Button>
        {!partner ? (
          <Button variant="ghost" className="px-4" onClick={() => openCycleDay(today)}>
            {t("cyLogToday")}
          </Button>
        ) : null}
      </div>
      <WeekStrip
        picked={picked}
        onPick={(ds) => {
          if (!partner) openCycleDay(ds);
          else setPicked((current) => (current === ds ? null : ds));
        }}
      />
      {partner && picked ? (
        <div className="cy-rise mt-2 rounded-card border border-border bg-surface-2/60 px-3 py-3">
          <p className="mb-2 text-xs font-semibold text-dim">{fmtShort(picked, lang)}</p>
          <PeriodDateActions date={picked} />
        </div>
      ) : null}
      <p className="mt-3 text-center text-xs leading-relaxed text-dim">
        {snap.nextPeriod && snap.late === 0 ? (
          <>
            {t("cyNextOn")} · <b className="font-semibold text-fg">{fmtShort(snap.nextPeriod, lang)}</b>
            {snap.window ? ` ${fill(t("cyWindowPm"), { n: snap.window })}` : ""}
            {" · "}
          </>
        ) : null}
        {t("cyEstimate")}
      </p>
      {tune ? <CycleTune /> : null}
    </div>
  );
}

function dialLine(snap: ReturnType<typeof cycleSnapshot>, today: string, t: (key: CopyKey) => string) {
  if (snap.late > 0) return snap.late === 1 ? t("cyLate1") : fill(t("cyLateN"), { n: snap.late });
  if (snap.stage === "period" && snap.periodDay) return fill(t("cyPeriodDayN"), { n: snap.periodDay });
  if (snap.stage === "ovulation") return t("cyOvulationToday");
  const toOv = snap.ovulation && snap.ovulation > today ? daysUntil(today, snap.ovulation) : null;
  if ((snap.stage === "fertile" || snap.stage === "follicular") && toOv !== null) {
    return toOv === 1 ? t("cyOvulationIn1") : fill(t("cyOvulationInN"), { n: toOv });
  }
  const n = snap.daysToPeriod ?? 0;
  if (n <= 0) return t("cyPeriodToday");
  return n === 1 ? t("cyPeriodIn1") : fill(t("cyPeriodInN"), { n });
}

function daysUntil(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

function RegularityBadge({ regularity }: { regularity: "learning" | "regular" | "irregular" }) {
  const t = useT();
  const key: CopyKey = regularity === "regular" ? "cyRegular" : regularity === "irregular" ? "cyIrregular" : "cyLearning";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        regularity === "regular" ? "border-[color:var(--cy-fertile)] cy-text-fertile" : regularity === "irregular" ? "border-[color:var(--cy-period)] cy-text-period" : "border-border text-dim",
      )}
    >
      {t(key)}
    </span>
  );
}

/* ── Dial ───────────────────────────────────────────────────────────────── */

const R = 100;
const C = 120;
const STROKE = 13;

function polar(angle: number, radius = R) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
}

function arcPathR(from: number, to: number, radius: number) {
  const [x1, y1] = polar(from, radius);
  const [x2, y2] = polar(to, radius);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function arcPath(from: number, to: number) {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function CycleDial({ snap, keyLine }: { snap: ReturnType<typeof cycleSnapshot>; keyLine: string }) {
  const { t, partner } = useCycleWords();
  const lang = useLang();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const sessions = useJournal((s) => s.journal.sessions);
  const openCycleDay = useJournal((s) => s.openCycleDay);
  const today = todayStr();
  const start = snap.cycleStart ?? today;
  const length = Math.max(snap.ringLength, 14);
  const runs = useMemo(() => {
    const marks = cycleMarks(cycle, start, addDays(start, length - 1), today);
    const out: { from: number; to: number; phase: CyclePhase; predicted: boolean }[] = [];
    for (let index = 0; index < length; index += 1) {
      const ds = addDays(start, index);
      const mark = marks[ds];
      if (!mark || mark.phase === "quiet") continue;
      const predicted = ds > today || mark.predicted;
      const last = out[out.length - 1];
      if (last && last.phase === mark.phase && last.predicted === predicted && last.to === index) last.to = index + 1;
      else out.push({ from: index, to: index + 1, phase: mark.phase, predicted });
    }
    return out;
  }, [cycle, start, length, today]);
  // Moments (sessions) inside this cycle, by ring index: shows where they fell against the window.
  const moments = useMemo(() => {
    const end = addDays(start, length - 1);
    const out = new Map<number, number>();
    for (const session of sessions) {
      if (session.date < start || session.date > end) continue;
      const index = daysUntil(start, session.date);
      out.set(index, (out.get(index) ?? 0) + 1);
    }
    return out;
  }, [sessions, start, length]);
  const step = 360 / length;
  const gap = Math.min(1.6, step * 0.18);
  const todayIndex = snap.day ? Math.min(snap.day, length) - 1 : 0;
  const [sel, setSel] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hinted, setHinted] = useState(() => {
    try { return localStorage.getItem("vela-cy-scrub") === "1"; } catch { return true; }
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shown = sel ?? todayIndex;
  const scrubbing = sel !== null && sel !== todayIndex;
  const shownDate = addDays(start, shown);

  function choose(index: number) {
    const next = ((index % length) + length) % length;
    setSel((current) => {
      if (current !== next && typeof navigator !== "undefined") navigator.vibrate?.(4);
      return next;
    });
    if (!hinted) {
      setHinted(true);
      try { localStorage.setItem("vela-cy-scrub", "1"); } catch { /* ignore */ }
    }
  }
  function indexAt(clientX: number, clientY: number) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    const dist = Math.hypot(dx, dy) / (box.width / 240);
    if (!dragging && (dist < R - 30 || dist > R + 30)) return null; // taps start on the ring only
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    return Math.floor((((angle % 360) + 360) % 360) / step);
  }

  const marks = useMemo(() => cycleMarks(cycle, start, addDays(start, length - 1), today), [cycle, start, length, today]);
  const info = scrubbing ? dayInfo(cycle, shownDate, today) : null;
  const stage: CycleStage = info?.stage ?? snap.stage;
  const offset = daysUntil(today, shownDate);
  const relative =
    offset === 0 ? t("cyTodayWord") : offset === 1 ? t("cyIn1") : offset === -1 ? t("cyAgo1") : offset > 0 ? fill(t("cyInN"), { n: offset }) : fill(t("cyAgoN"), { n: -offset });
  const phaseNote = info ? (info.stage === "ovulation" ? t("cyOvulationNote") : info.stage === "fertile" ? t("cyFertileNote") : "") : "";
  const count = moments.get(shown) ?? 0;
  const regular = cycleStats(cycle).regularity === "regular";
  // Lower-chance days: from 3 days after the estimated ovulation (4 while the rhythm is still learning) to the period.
  const low = useMemo(() => {
    const ov = runs.find((run) => run.phase === "ovulation");
    if (!ov) return null;
    const from = ov.from + (regular ? 3 : 4);
    return from < length - 1 ? { from, to: length } : null;
  }, [runs, length, regular]);
  const tiles = useMemo(() => {
    const out: { key: string; label: CopyKey; dot: string; from: number; to: number }[] = [];
    const first = (phase: CyclePhase) => runs.find((run) => run.phase === phase);
    const period = first("period");
    const fertile = first("fertile");
    const ov = first("ovulation");
    if (period) out.push({ key: "period", label: "cyLegendPeriod", dot: "cy-bg-period", from: period.from, to: period.to });
    if (fertile) out.push({ key: "fertile", label: "cyLegendFertile", dot: "cy-bg-fertile", from: fertile.from, to: fertile.to });
    if (ov) out.push({ key: "ovulation", label: "cyLegendOvulation", dot: "cy-bg-ovulation", from: ov.from, to: ov.to });
    if (low) out.push({ key: "low", label: "cyLowTile", dot: "cy-bg-low", from: low.from, to: low.to });
    return out;
  }, [runs, low]);
  const inLow = Boolean(low && shown >= low.from && shown < low.to);
  const lowNote = scrubbing && !phaseNote && inLow ? t("cyLowNote") : "";

  const [tx, ty] = polar(todayIndex * step + step / 2);
  const [sx, sy] = polar(shown * step + step / 2);
  const ticks = Array.from({ length }, (_, index) => index);
  const shownMark = marks[shownDate];
  return (
    <div className="mt-1">
      <div
        className={cn("cy-dial", dragging && "is-dragging")}
        role="slider"
        tabIndex={0}
        aria-label={t("cyDialAria")}
        aria-valuemin={1}
        aria-valuemax={length}
        aria-valuenow={shown + 1}
        aria-valuetext={`${fmtShort(shownDate, lang)} · ${t("cycleDay")} ${shown + 1} · ${t(stageKey(stage))} · ${scrubbing ? relative : keyLine}`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); choose(shown + 1); }
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); choose(shown - 1); }
          else if (event.key === "Home" || event.key === "Escape") { event.preventDefault(); setSel(null); }
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 240 240"
          aria-hidden
          className="cy-dial-svg"
          onPointerDown={(event) => {
            const index = indexAt(event.clientX, event.clientY);
            if (index === null) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
            choose(index);
          }}
          onPointerMove={(event) => {
            if (!dragging) return;
            const index = indexAt(event.clientX, event.clientY);
            if (index !== null) choose(index);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--cy-track)" strokeWidth={STROKE} />
          {ticks.map((index) => {
            const [x1, y1] = polar(index * step, R - STROKE / 2 - 5);
            const [x2, y2] = polar(index * step, R - STROKE / 2 - (index % 7 === 0 ? 10 : 7));
            return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ag-dim)" strokeOpacity={index % 7 === 0 ? 0.55 : 0.22} strokeWidth={1} strokeLinecap="round" />;
          })}
          <g className="cy-arcs">
            {runs
              .filter((run) => run.phase !== "ovulation")
              .map((run) => (
                <path
                  key={`${run.from}-${run.phase}-${run.predicted}`}
                  d={arcPath(run.from * step + gap / 2, run.to * step - gap / 2)}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeLinecap="butt"
                  className={cn(`cy-arc-${run.phase}`, run.predicted && "cy-arc-pred", scrubbing && shown >= run.from && shown < run.to && "cy-arc-lit")}
                />
              ))}
            {runs
              .filter((run) => run.phase === "ovulation")
              .map((run) => {
                const [ox, oy] = polar(run.from * step + step / 2);
                return <circle key={`ov-${run.from}`} cx={ox} cy={oy} r={STROKE / 2 + 2.5} className={cn("cy-ov-dot", run.predicted && "cy-ov-pred")} />;
              })}
          </g>
          {low ? (
            <path d={arcPathR(low.from * step + gap / 2, low.to * step - gap / 2, R + STROKE / 2 + 2.6)} fill="none" strokeWidth={2.4} strokeLinecap="round" className={cn("cy-arc-low", inLow && scrubbing && "is-lit")} />
          ) : null}
          <g className="cy-moments">
            {[...moments.keys()].map((index) => {
              const [mx, my] = polar(index * step + step / 2, R + STROKE / 2 + 8.5);
              return <circle key={`m-${index}`} cx={mx} cy={my} r={moments.get(index)! > 1 ? 2.6 : 2} className="cy-moment" />;
            })}
          </g>
          {snap.day ? (
            <>
              <circle cx={tx} cy={ty} r={13} className="cy-today-halo" />
              <circle cx={tx} cy={ty} r={7.5} className="cy-today-dot" />
            </>
          ) : null}
          {scrubbing ? (
            <g className="cy-knob">
              <circle cx={sx} cy={sy} r={11.5} className={cn("cy-knob-ring", shownMark && shownMark.phase !== "quiet" && `cy-knob-${shownMark.phase}`)} />
              <circle cx={sx} cy={sy} r={4} className="cy-knob-core" />
            </g>
          ) : null}
        </svg>
        <button
          type="button"
          className={cn("cy-center", scrubbing && "is-scrub")}
          tabIndex={-1}
          aria-hidden
          onClick={() => setSel(null)}
        >
          <span key={scrubbing ? shownDate : "today"} className="cy-center-in">
            <span className={cn("text-[10px] font-semibold text-dim uppercase", scrubbing ? "tracking-[0.1em]" : "tracking-[0.22em]")}>
              {scrubbing ? `${t("cycleDay")} · ${parseDate(shownDate).toLocaleDateString(lang === "es" ? "es" : "en", { weekday: "short", month: "short", day: "numeric" })}` : t("cycleDay")}
            </span>
            <span className={cn("font-display leading-[0.95] tabular-nums", scrubbing ? "text-[3rem]" : "text-[3.4rem]")} data-testid="cycle-day">
              {scrubbing ? shown + 1 : (snap.day ?? "—")}
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <span className={cn("size-2 rounded-full", stageDot(stage))} />
              {t(stageKey(stage))}
            </span>
            <span className={cn("mt-1 max-w-[11rem] text-xs leading-snug", !scrubbing && snap.late > 0 ? "cy-text-period font-semibold" : "text-dim")}>
              {scrubbing ? (
                <>
                  {relative}
                  {offset > 0 ? ` · ${t("cyLegendPredicted").toLowerCase()}` : ""}
                </>
              ) : (
                keyLine
              )}
            </span>
            {count > 0 ? (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                <span className="cy-moment-dot" />
                {count === 1 ? t("cyMoment1") : fill(t("cyMomentsN"), { n: count })}
              </span>
            ) : null}
          </span>
        </button>
      </div>
      <div className={cn("cy-tiles mt-3 grid gap-1.5", tiles.length === 4 ? "grid-cols-4" : "grid-cols-3")} data-testid="cycle-phase-chips">
        {tiles.map((tile) => {
          const on = scrubbing && shown >= tile.from && shown < tile.to;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => choose(tile.from)}
              className={cn("cy-tile", on && "is-on", tile.key === "low" && "is-low")}
              aria-label={`${t("cyJumpTo")} ${t(tile.label)}`}
              aria-pressed={on}
            >
              <span className="flex items-center gap-1">
                <span className={cn("size-2 shrink-0 rounded-full", tile.dot)} />
                <span className="tabular-nums text-dim">{tile.to - tile.from > 1 ? `${tile.from + 1}–${tile.to}` : tile.from + 1}</span>
              </span>
              <span className="w-full font-semibold leading-tight [overflow-wrap:anywhere]">{t(tile.label)}</span>
            </button>
          );
        })}
      </div>
      <div className="cy-actions mt-2 min-h-[37px]">
        {scrubbing ? (
          <div className="cy-rise space-y-2">
            {phaseNote || lowNote ? <p className={cn("text-center text-xs font-semibold", phaseNote ? "cy-text-fertile" : "cy-text-low")}>{phaseNote || lowNote}</p> : null}
            <div className="flex items-center justify-center gap-2">
              <button type="button" className="cy-act shrink-0" onClick={() => setSel(null)} aria-label={t("cyBackToday")}>
                <RotateCcw className="size-3.5" aria-hidden />
                {t("cyTodayShort")}
              </button>
              {shownDate <= today ? (
                partner ? (
                  <PeriodDateActions date={shownDate} compact />
                ) : (
                  <button type="button" className="cy-act is-accent" onClick={() => openCycleDay(shownDate)}>
                    {cycle.days[shownDate] ? t("cyEditDay") : t("cyLogDay")}
                  </button>
                )
              ) : null}
            </div>
          </div>
        ) : (
          <p className="pt-2 text-center text-[11px] leading-snug text-dim">{hinted && low ? t("cyLowWhy") : t("cyScrubHint")}</p>
        )}
      </div>
    </div>
  );
}

/* ── 7-day strip ────────────────────────────────────────────────────────── */

function WeekStrip({ picked, onPick }: { picked: string | null; onPick: (ds: string) => void }) {
  const lang = useLang();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const partner = cycle.perspective === "partner";
  const today = todayStr();
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 3));
  const marks = cycleMarks(cycle, days[0], days[6], today);
  return (
    <div className="mt-4 grid grid-cols-7 gap-1" data-testid="cycle-week">
      {days.map((ds) => {
        const parsed = parseDate(ds);
        const mark = marks[ds];
        const future = ds > today;
        const logged = !partner && Boolean(cycle.days[ds]);
        return (
          <button
            key={ds}
            type="button"
            disabled={future}
            onClick={() => onPick(ds)}
            aria-pressed={picked === ds}
            aria-label={ds}
            className={cn("cy-week-day flex flex-col items-center gap-1 rounded-xl py-1.5", picked === ds && "bg-surface-2", future && "opacity-80")}
          >
            <span className={cn("text-[10px] font-semibold uppercase", ds === today ? "text-accent" : "text-dim")}>
              {parsed.toLocaleDateString(lang === "es" ? "es" : "en", { weekday: "narrow" })}
            </span>
            <span
              className={cn(
                "cy-week-num grid size-9 place-items-center rounded-full text-sm font-semibold tabular-nums",
                markClass(mark),
                ds === today && "cy-today-ring",
              )}
            >
              {parsed.getDate()}
            </span>
            <span className={cn("size-1 rounded-full", logged ? "bg-accent" : "bg-transparent")} />
          </button>
        );
      })}
    </div>
  );
}

/* ── Start / end toggles for one date ───────────────────────────────────── */

export function PeriodDateActions({ date, compact = false }: { date: string; compact?: boolean }) {
  const { t, w } = useCycleWords();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const logPeriodStart = useJournal((s) => s.logPeriodStart);
  const removePeriodStart = useJournal((s) => s.removePeriodStart);
  const setPeriodEnd = useJournal((s) => s.setPeriodEnd);
  const showToast = useJournal((s) => s.showToast);
  const today = todayStr();
  const isStart = cycle.starts.includes(date);
  const container = periodContaining(cycle, date);
  // "Last day" is offered only near that period (logged or estimated end, plus a few days), never mid-cycle.
  const canEnd = container && date > container.start && date <= today && date <= addDays(container.end ?? container.estimatedEnd, 3);
  const isEnd = Boolean(container && cycle.ends[container.start] === date);
  const insidePeriod = Boolean(container && date > container.start && date <= (container.end ?? container.estimatedEnd));
  if (date > today) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", compact && "gap-1.5")}>
      {insidePeriod ? null : (
      <ToggleChip
        on={isStart}
        onClick={() => {
          if (isStart) removePeriodStart(date);
          else {
            logPeriodStart(date);
            showToast(t("cyStartToast"));
          }
        }}
      >
        {w("cyMarkStart")}
      </ToggleChip>
      )}
      {canEnd ? (
        <ToggleChip
          on={isEnd}
          onClick={() => {
            setPeriodEnd(container.start, isEnd ? null : date);
            if (!isEnd) showToast(t("cyEndToast"));
          }}
        >
          {w("cyMarkEnd")}
        </ToggleChip>
      ) : null}
    </div>
  );
}

export function ToggleChip({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[37px] items-center gap-1.5 rounded-full border px-[0.85rem] text-[0.8rem] font-semibold",
        on ? "ag-chip-on" : "ag-pill border-border text-fg",
        className,
      )}
    >
      {on ? <Check className="size-3.5" aria-hidden /> : null}
      {children}
    </button>
  );
}

/* ── Empty state: perspective + first day ───────────────────────────────── */

function FirstStart() {
  const { t, w, partner } = useCycleWords();
  const lang = useLang();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const setCycle = useJournal((s) => s.setCycle);
  const logPeriodStart = useJournal((s) => s.logPeriodStart);
  const weekStart = useJournal((s) => s.journal.settings.weekStart);
  const showToast = useJournal((s) => s.showToast);
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState(cycle.partnerName);
  const today = todayStr();
  // Five full weeks ending with this week: enough to find a recent first day without scrolling.
  const dow = parseDate(today).getDay();
  const lead = weekStart === "monday" ? (dow + 6) % 7 : dow;
  const first = addDays(today, -lead - 28);
  const days = Array.from({ length: 35 }, (_, index) => addDays(first, index));
  const heads = days.slice(0, 7).map((ds) => parseDate(ds).toLocaleDateString(lang === "es" ? "es" : "en", { weekday: "narrow" }));
  return (
    <div className="ag-panel rounded-card border border-border px-4 py-4" id="cycle-card" data-testid="cycle-first">
      <p className="text-xs font-semibold tracking-[0.16em] text-dim uppercase">{w("cyTitle")}</p>
      <div className="ag-seg mt-3 grid grid-cols-2 gap-1 rounded-card p-1" role="group" aria-label={t("cyPerspective")}>
        {(["self", "partner"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={cycle.perspective === value}
            onClick={() => setCycle({ perspective: value })}
            className={cn(
              "ag-seg-btn min-h-10 rounded-[0.85rem] px-2 text-xs leading-tight font-semibold",
              cycle.perspective === value ? "ag-pick" : "text-dim",
            )}
          >
            {t(value === "self" ? "cyPerspSelf" : "cyPerspPartner")}
          </button>
        ))}
      </div>
      {partner ? (
        <input
          className={cn(fieldClass, "mt-2 py-2.5 text-sm")}
          value={name}
          maxLength={40}
          placeholder={t("cyHerNamePh")}
          aria-label={t("cyHerName")}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setCycle({ partnerName: name })}
        />
      ) : null}
      <h3 className="mt-4 font-display text-[1.6rem] leading-tight">{w("cyFirstTitle")}</h3>
      <p className="mt-1 text-sm leading-relaxed text-dim">{w("cyFirstBody")}</p>
      <div className="mt-3 rounded-card border border-border bg-surface-2/50 px-2 py-2">
        <div className="grid grid-cols-7 pb-1 text-center text-[10px] font-semibold text-dim">
          {heads.map((head, index) => (
            <span key={index}>{head}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((ds) => {
            const future = ds > today;
            const on = chosen === ds;
            const day = parseDate(ds).getDate();
            return (
              <button
                key={ds}
                type="button"
                disabled={future}
                aria-pressed={on}
                aria-label={ds}
                onClick={() => setChosen(on ? null : ds)}
                className="grid place-items-center py-0.5 disabled:opacity-30"
              >
                <span
                  className={cn(
                    "cy-week-num grid size-9 place-items-center rounded-full text-sm tabular-nums transition",
                    on ? "cy-bg-period font-bold text-[color:var(--cy-ink)]" : ds === today ? "cy-today-ring" : "",
                    day === 1 && !on && "font-semibold text-accent",
                  )}
                >
                  {day}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <Button
        className="mt-3 w-full"
        disabled={!chosen}
        onClick={() => {
          if (!chosen) return;
          if (partner && name !== cycle.partnerName) setCycle({ partnerName: name });
          logPeriodStart(chosen);
          showToast(t("cyStartToast"));
        }}
      >
        {chosen ? `${t("cyFirstSave")} · ${fmtShort(chosen, lang)}` : t("cyFirstPick")}
      </Button>
    </div>
  );
}

/* ── Usual lengths ──────────────────────────────────────────────────────── */

export function CycleTune() {
  const t = useT();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const setCycle = useJournal((s) => s.setCycle);
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <TuneRow label={t("cyclePeriodLen")} value={cycle.periodDays} min={2} max={10} suffix={t("cycleDaysWord")} onChange={(periodDays) => setCycle({ periodDays })} />
      <TuneRow label={t("cycleLen")} value={cycle.cycleDays} min={21} max={45} suffix={t("cycleDaysWord")} onChange={(cycleDays) => setCycle({ cycleDays })} />
      <TuneRow label={t("cycleLuteal")} value={cycle.lutealDays} min={10} max={18} suffix={t("cycleDaysWord")} onChange={(lutealDays) => setCycle({ lutealDays })} />
      <p className="text-xs leading-relaxed text-dim">{t("cycleLutealHint")}</p>
      <TuneRow label={t("cycleFertileDays")} value={cycle.fertileDays} min={3} max={7} suffix={t("cycleDaysWord")} onChange={(fertileDays) => setCycle({ fertileDays })} />
      <p className="text-xs leading-relaxed text-dim">{t("cycleFertileHint")}</p>
      <p className="text-xs leading-relaxed text-dim">{t("cycleAvgNote")}</p>
    </div>
  );
}

function TuneRow({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
      <button type="button" className="grid size-9 place-items-center rounded-full border border-border" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} −`}>
        –
      </button>
      <span className="w-16 text-center text-sm tabular-nums">
        {value} {suffix}
      </span>
      <button type="button" className="grid size-9 place-items-center rounded-full border border-border" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label} +`}>
        +
      </button>
    </div>
  );
}

/* ── Insights ───────────────────────────────────────────────────────────── */

export function CycleStats() {
  const { t, w, partner } = useCycleWords();
  const lang = useLang();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const sessions = useJournal((s) => s.journal.sessions);
  const openPhase = useJournal((s) => s.openHistPhase);
  if (!cycle.enabled || cycle.starts.length === 0) return null;
  const today = todayStr();
  const snap = cycleSnapshot(cycle, today);
  const stats = cycleStats(cycle);
  const history = pastCycles(cycle, 6);
  const counts = sessionsByPhase(cycle, sessions.map((session) => session.date), today);
  const rows: { phase: "period" | "fertile" | "quiet"; label: string; value: number; dot: string }[] = [
    { phase: "period", label: t("cyclePeriod"), value: counts.period, dot: "cy-bg-period" },
    { phase: "fertile", label: t("cycleFertile"), value: counts.fertile + counts.ovulation, dot: "cy-bg-fertile" },
    { phase: "quiet", label: t("cyclePhaseQuiet"), value: counts.quiet, dot: "cy-bg-quiet" },
  ];
  const max = Math.max(1, ...rows.map((row) => row.value));
  const libido = partner ? null : libidoByPhase(cycle, today);
  const longest = Math.max(35, ...history.map((row) => row.length));
  const regularityLine =
    stats.regularity === "learning"
      ? t("cyNeedMore")
      : `${t(stats.regularity === "regular" ? "cyRegular" : "cyIrregular")} · ${fill(t("cyRangeDays"), { a: stats.min ?? "", b: stats.max ?? "" })}`;
  return (
    <Card className="min-w-0 overflow-hidden" data-testid="cycle-stats">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-2xl">{w("cyTitle")}</h2>
        <RegularityBadge regularity={stats.regularity} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini value={`${stats.cycle}`} unit={t("cycleDaysWord")} label={t("cycleAvgLen")} />
        <Mini value={`${stats.period}`} unit={t("cycleDaysWord")} label={t("cyAvgPeriod")} />
        <Mini value={snap.nextPeriod ? fmtShort(snap.nextPeriod, lang) : "—"} label={t("cycleNextPeriod")} />
      </div>
      <p className="mt-3 text-sm text-dim">
        <span className="font-semibold text-fg">{t("cyRegularity")}:</span> {regularityLine}
      </p>
      {history.length > 0 ? (
        <>
          <p className="mt-4 text-sm font-semibold">{t("cyLastCycles")}</p>
          <div className="mt-2 flex h-36 items-end gap-2" data-testid="cycle-bars">
            {history.map((row) => (
              <div key={row.start} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[11px] font-semibold tabular-nums">{row.length}</span>
                <span className="relative flex w-full max-w-9 flex-col justify-end overflow-hidden rounded-[10px] bg-surface-2" style={{ height: `${Math.round((row.length / longest) * 96)}px` }}>
                  <span className={cn("block w-full", row.periodLogged ? "cy-bg-period" : "cy-bg-period opacity-60")} style={{ height: `${Math.round((row.period / row.length) * 100)}%` }} />
                </span>
                <span className="w-full truncate text-center text-[10px] text-dim">{fmtShort(row.start, lang)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <p className="mt-4 text-sm font-semibold">{t("cycleInMoments")}</p>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <button key={row.phase} type="button" className="block w-full min-w-0 text-left" onClick={() => openPhase(row.phase)}>
            <span className="mb-1 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold">
                <span className={cn("size-2 shrink-0 rounded-full", row.dot)} />
                {row.label}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-dim">{row.value}</span>
            </span>
            <span className="block h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <span className="ag-liquid block h-full max-w-full rounded-full" style={{ width: `${Math.max(row.value > 0 ? 8 : 0, Math.round((row.value / max) * 100))}%` }} />
            </span>
          </button>
        ))}
      </div>
      {libido && libido.total > 0 ? <LibidoRows libido={libido} /> : null}
    </Card>
  );
}

function LibidoRows({ libido }: { libido: ReturnType<typeof libidoByPhase> }) {
  const t = useT();
  const cols: { phase: CyclePhase; label: CopyKey; dot: string }[] = [
    { phase: "period", label: "cyLegendPeriod", dot: "cy-bg-period" },
    { phase: "fertile", label: "cyLegendFertile", dot: "cy-bg-fertile" },
    { phase: "ovulation", label: "cyLegendOvulation", dot: "cy-bg-ovulation" },
    { phase: "quiet", label: "cyclePhaseQuiet", dot: "cy-bg-quiet" },
  ];
  const top = cols.reduce((best, col) => (libido.high[col.phase] > libido.high[best.phase] ? col : best), cols[0]);
  const peak = Math.max(1, ...cols.flatMap((col) => [libido.high[col.phase], libido.low[col.phase]]));
  return (
    <div className="mt-4" data-testid="cycle-libido">
      <p className="text-sm font-semibold">{t("cyLibido")}</p>
      {libido.high[top.phase] > 0 && top.phase !== "quiet" ? <p className="mt-1 text-sm text-dim">{fill(t("cyLibidoPeak"), { phase: t(top.label).toLowerCase() })}</p> : null}
      <div className="mt-2 grid grid-cols-[auto_repeat(4,minmax(0,1fr))] items-center gap-x-2 gap-y-1.5 text-[11px]">
        <span />
        {cols.map((col) => (
          <span key={col.phase} className="flex min-w-0 items-center justify-center gap-1 truncate text-dim">
            <span className={cn("size-1.5 shrink-0 rounded-full", col.dot)} />
            <span className="truncate">{t(col.label)}</span>
          </span>
        ))}
        {(["high", "low"] as const).map((kind) => (
          <FragmentRow key={kind} label={t(kind === "high" ? "cyLibidoHigh" : "cyLibidoLow")} values={cols.map((col) => libido[kind][col.phase])} peak={peak} />
        ))}
      </div>
    </div>
  );
}

function FragmentRow({ label, values, peak }: { label: string; values: number[]; peak: number }) {
  return (
    <>
      <span className="font-semibold">{label}</span>
      {values.map((value, index) => (
        <span key={index} className="grid h-7 place-items-center rounded-lg tabular-nums" style={{ background: `color-mix(in srgb, var(--ag-accent) ${value ? 10 + Math.round((value / peak) * 45) : 4}%, transparent)` }}>
          {value}
        </span>
      ))}
    </>
  );
}

function Mini({ value, label, unit }: { value: string; label: string; unit?: string }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-border bg-surface-2 px-2 py-3 text-center">
      <b className="block truncate font-display text-xl tabular-nums leading-none text-accent">
        {value}
        {unit ? <span className="ml-0.5 font-sans text-[10px] font-semibold text-dim">{unit}</span> : null}
      </b>
      <span className="mt-1.5 block truncate text-[10px] text-dim">{label}</span>
    </div>
  );
}

/* ── Calendar: the selected day ─────────────────────────────────────────── */

export function CycleDayPanel({ date }: { date: string }) {
  const { t, partner } = useCycleWords();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const openCycleDay = useJournal((s) => s.openCycleDay);
  if (!cycle.enabled) return null;
  const today = todayStr();
  const info = dayInfo(cycle, date, today);
  const log = partner ? null : cycle.days[date];
  return (
    <div className="mb-3 space-y-2" data-testid="cycle-day-panel">
      {info ? (
        <p className="flex items-center gap-2 text-sm">
          <span className={cn("size-2 rounded-full", stageDot(info.stage))} />
          <span className="font-semibold">{t(stageKey(info.stage))}</span>
          {info.cycleDay ? <span className="text-dim">· {t("cycleDay")} {info.cycleDay}</span> : null}
          {info.predicted ? <span className="text-dim">· {t("cyLegendPredicted").toLowerCase()}</span> : null}
        </p>
      ) : null}
      {log ? <DayLogSummary date={date} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodDateActions date={date} />
        {!partner && date <= today ? (
          <button type="button" className="min-h-[37px] px-2 text-sm font-semibold text-accent" onClick={() => openCycleDay(date)}>
            {log ? t("cyEditDay") : t("cyLogDay")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const FLOW_KEY = { spotting: "cyFlowSpotting", light: "cyFlowLight", medium: "cyFlowMedium", heavy: "cyFlowHeavy" } as const;
export const SYMPTOM_KEY = {
  cramps: "cySymCramps",
  headache: "cySymHeadache",
  bloating: "cySymBloating",
  tender: "cySymTender",
  fatigue: "cySymFatigue",
  acne: "cySymAcne",
  libidoHigh: "cySymLibidoHigh",
  libidoLow: "cySymLibidoLow",
  discharge: "cySymDischarge",
} as const;
export const MOOD_KEY = {
  calm: "cyMoodCalm",
  happy: "cyMoodHappy",
  sensitive: "cyMoodSensitive",
  irritable: "cyMoodIrritable",
  anxious: "cyMoodAnxious",
  low: "cyMoodLow",
} as const;
export { FLOW_KEY };

function DayLogSummary({ date }: { date: string }) {
  const t = useT();
  const log = useJournal((s) => s.journal.settings.cycle.days[date]);
  if (!log) return null;
  const parts = [
    log.flow ? `${t("cyFlow")}: ${t(FLOW_KEY[log.flow])}` : "",
    ...(log.symptoms ?? []).map((item) => t(SYMPTOM_KEY[item])),
    log.mood ? t(MOOD_KEY[log.mood]) : "",
  ].filter(Boolean);
  return (
    <div className="space-y-1">
      {parts.length ? (
        <div className="flex flex-wrap gap-1.5">
          {parts.map((part) => (
            <span key={part} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs">
              {part}
            </span>
          ))}
        </div>
      ) : null}
      {log.note ? <p className="text-sm leading-relaxed text-dim">“{log.note}”</p> : null}
    </div>
  );
}

/* ── Session form: phase of the session's date ──────────────────────────── */

export function SessionPhaseChip({ date }: { date: string }) {
  const t = useT();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  if (!cycle.enabled || cycle.starts.length === 0) return null;
  const info = dayInfo(cycle, date, todayStr());
  if (!info) return null;
  const note = info.stage === "ovulation" ? t("cyOvulationNote") : info.stage === "fertile" ? t("cyFertileNote") : "";
  return (
    <div className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="session-phase">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold">
        <span className={cn("size-2 rounded-full", stageDot(info.stage))} />
        {t(stageKey(info.stage))}
        {info.cycleDay ? <span className="font-medium text-dim">· {t("cycleDay")} {info.cycleDay}</span> : null}
      </span>
      {note ? <span className="cy-text-fertile text-xs font-medium leading-snug">{note}</span> : null}
    </div>
  );
}

/* ── History: one small dot per entry ───────────────────────────────────── */

export function PhaseDot({ date, className }: { date: string; className?: string }) {
  const t = useT();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  if (!cycle.enabled || cycle.starts.length === 0) return null;
  const info = dayInfo(cycle, date, todayStr());
  if (!info || info.phase === "quiet") return null;
  const label = t(stageKey(info.stage));
  return <span role="img" aria-label={label} title={label} className={cn("inline-block size-2 shrink-0 rounded-full align-middle", stageDot(info.stage), className)} />;
}

/* ── Header pill ────────────────────────────────────────────────────────── */

const PILL_KEY: Record<CycleStage, CopyKey> = {
  period: "cyLegendPeriod",
  follicular: "cyShortFollicular",
  fertile: "cyLegendFertile",
  ovulation: "cyLegendOvulation",
  luteal: "cyShortLuteal",
  late: "cyShortLate",
};

export function CyclePill() {
  const t = useT();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const discreet = useJournal((s) => s.journal.settings.discreet);
  const setCycleSheet = useJournal((s) => s.setCycleSheet);
  if (!cycle.enabled || cycle.starts.length === 0) return null;
  const snap = cycleSnapshot(cycle, todayStr());
  if (!snap.day) return null;
  return (
    <button type="button" className="cy-pill" aria-label={t("cyOpenCycle")} onClick={() => setCycleSheet(true)} data-testid="cycle-pill">
      <span className={cn("size-1.5 rounded-full", stageDot(snap.stage))} />
      <span className="tabular-nums">
        {t("cyDayShort")}
        {snap.day}
      </span>
      <span className="text-dim">·</span>
      <span>{discreet ? t(stageKey(snap.stage, true)) : snap.late > 0 ? `${t("cyShortLate")} +${snap.late}` : t(PILL_KEY[snap.stage])}</span>
    </button>
  );
}

/* ── Calendar legend ────────────────────────────────────────────────────── */

export function CycleLegend() {
  const t = useT();
  const items: { key: CopyKey; cls: string }[] = [
    { key: "cyLegendPeriod", cls: "cy-mark-period" },
    { key: "cyLegendPredicted", cls: "cy-mark-period-pred" },
    { key: "cyLegendFertile", cls: "cy-mark-fertile" },
    { key: "cyLegendOvulation", cls: "cy-mark-ovulation" },
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-dim" data-testid="cycle-legend">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span className={cn("cy-week-num inline-block size-3 rounded-full", item.cls)} />
          {t(item.key)}
        </span>
      ))}
    </div>
  );
}
