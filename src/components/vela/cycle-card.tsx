import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Droplet, NotebookPen, RotateCcw, Settings2, X } from "lucide-react";
import {
  cycleMarks,
  cycleSnapshot,
  cycleStats,
  dayInfo,
  libidoByPhase,
  lowChanceDays,
  lowChanceReady,
  pastCycles,
  periodContaining,
  type CyclePhase,
  type CycleStage,
  type DayMark,
} from "@/lib/vela/cycle";
import type { CopyKey } from "@/lib/vela/copy";
import { fill, stageKey, trackerLabel, useCycleWords } from "@/lib/vela/cycle-words";
import { sessionsByPhaseFor, trackerForPartner, visibleTrackers } from "@/lib/vela/cycle-trackers";
import { addDays, fmtShort, parseDate, todayStr } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { selectActiveCycle, useJournal } from "@/lib/vela/store";
import { cn } from "@/lib/cn";
import { Button, Card, fieldClass } from "./ui";
import { CycleSky } from "./cycle-sky";

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

/* ── Whose cycle: switcher shown only with 2+ visible trackers ──────────── */

export function TrackerSwitch({ className }: { className?: string }) {
  const t = useT();
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const active = useJournal(selectActiveCycle);
  const selectCycle = useJournal((s) => s.selectCycle);
  const live = visibleTrackers(cycles);
  if (live.length < 2) return null;
  return (
    <div
      className={cn("ag-seg flex gap-1 overflow-x-auto rounded-card p-1", className)}
      role="group"
      aria-label={t("cyWhoseAria")}
      data-testid="cycle-switch"
      data-noswipe
    >
      {live.map((tracker) => {
        const on = tracker.id === active.id;
        return (
          <button
            key={tracker.id}
            type="button"
            aria-pressed={on}
            onClick={() => selectCycle(tracker.id)}
            data-tracker={tracker.id}
            className={cn(
              "ag-seg-btn min-h-9 min-w-0 flex-1 basis-0 truncate rounded-[0.85rem] px-3 text-xs font-semibold whitespace-nowrap",
              on ? "ag-pick" : "text-dim",
            )}
            style={{ minWidth: "4.5rem" }}
          >
            {trackerLabel(tracker, t)}
          </button>
        );
      })}
    </div>
  );
}

/* ── Home card ──────────────────────────────────────────────────────────── */

type Snap = ReturnType<typeof cycleSnapshot>;
type Act = { key: string; label: string; icon?: "drop" | "log"; run: () => void; testId?: string };

/** The period is close enough that "Period started" is the likely next action: 3 days before it is due, through late. */
function nearPeriod(snap: Snap, date: string) {
  if (!snap.cycleStart) return false;
  return date >= addDays(snap.cycleStart, snap.length - 3);
}

export function CycleCard({ inSheet = false, onClose }: { inSheet?: boolean; onClose?: () => void }) {
  const { t, w, partner } = useCycleWords();
  const lang = useLang();
  const cycle = useJournal(selectActiveCycle);
  const setCycle = useJournal((s) => s.setCycle);
  const logPeriodStart = useJournal((s) => s.logPeriodStart);
  const setPeriodEnd = useJournal((s) => s.setPeriodEnd);
  const openCycleDay = useJournal((s) => s.openCycleDay);
  const showToast = useJournal((s) => s.showToast);
  const [tune, setTune] = useState(false);
  const [regInfo, setRegInfo] = useState(false);
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
  const started: Act = {
    key: "start",
    label: w("cyPeriodStarted"),
    icon: "drop",
    testId: "cycle-start",
    run: () => {
      logPeriodStart(today);
      showToast(t("cyStartToast"));
    },
  };
  const ended: Act = {
    key: "end",
    label: w("cyPeriodEnded"),
    icon: "drop",
    run: () => {
      if (snap.cycleStart) setPeriodEnd(snap.cycleStart, today);
      showToast(t("cyEndToast"));
    },
  };
  const logToday: Act = { key: "log", label: t("cyLogToday"), icon: "log", run: () => openCycleDay(today) };
  // One amber action for what today most likely needs; the other stays one tap away, outlined.
  let primary: Act | null;
  let secondary: Act | null;
  if (snap.periodOpen) {
    // Early in the period the day log matters most; near its usual end, "Period ended" leads.
    const ending = (snap.periodDay ?? 0) >= Math.max(3, snap.periodLength - 1);
    primary = ending ? ended : partner ? null : logToday;
    secondary = ending ? (partner ? null : logToday) : ended;
  } else if (nearPeriod(snap, today)) {
    primary = started;
    secondary = partner ? null : logToday;
  } else {
    primary = partner ? null : logToday;
    secondary = started;
  }
  const idle = (
    <div className="cy-row flex h-12 gap-2">
      {primary ? <ActButton act={primary} testId="cycle-primary" /> : null}
      {secondary ? <ActButton act={secondary} ghost testId={primary ? "cycle-secondary" : "cycle-primary"} /> : null}
    </div>
  );

  return (
    <div className={cn(!inSheet && "ag-panel rounded-card border border-border px-4 py-4")} id={inSheet ? undefined : "cycle-card"} data-testid="cycle-card">
      <TrackerSwitch className="mb-3" />
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.16em] text-dim uppercase">{w("cyTitle")}</p>
        <RegularityBadge regularity={stats.regularity} open={regInfo} onToggle={() => setRegInfo((open) => !open)} />
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
      {regInfo ? <RegularityInfo stats={stats} measured={lowChanceReady(cycle).measured} /> : null}
      <CycleDial snap={snap} keyLine={keyLine} idle={idle} />
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
      <p className="mt-3 text-center text-[11px] leading-relaxed text-dim" data-testid="cycle-footnote">
        {snap.window && snap.late === 0 ? `${fill(t("cyFcShift"), { n: snap.window })} · ` : ""}
        {t("cyEstimate")}
      </p>
      {tune ? <CycleTune /> : null}
    </div>
  );
}

function ActButton({ act, ghost = false, testId }: { act: Act; ghost?: boolean; testId?: string }) {
  // Only the amber action carries an icon; the outlined one stays quiet (and leaves room for Spanish).
  const Icon = ghost ? null : act.icon === "drop" ? Droplet : act.icon === "log" ? NotebookPen : null;
  return (
    <Button variant={ghost ? "ghost" : "primary"} className={cn("cy-btn min-w-0 px-3", !ghost && "cy-main")} onClick={act.run} data-testid={testId} data-act={act.key}>
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      <span className="min-w-0 truncate">{act.label}</span>
    </Button>
  );
}

function dialLine(snap: Snap, today: string, t: (key: CopyKey) => string) {
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

/**
 * The one-line forecast in the middle of the dial (two short lines so it never wraps mid-phrase):
 * what this phase is about, then the next period. "~" marks dates that are still a first guess.
 */
function useForecast(snap: Snap, today: string): { lead: string; next: string; late: boolean } {
  const { t, partner } = useCycleWords();
  const lang = useLang();
  const name = useJournal((s) => selectActiveCycle(s).partnerName).trim();
  const loc = lang === "es" ? "es" : "en";
  const weekday = (ds: string) => parseDate(ds).toLocaleDateString(loc, { weekday: "short" }).replace(/\.$/, "");
  const soon = (ds: string) => (daysUntil(today, ds) <= 6 ? weekday(ds) : fmtShort(ds, lang));
  const guess = snap.regularity === "learning" ? "~" : "";
  const nextDate = snap.nextPeriod ? `${guess}${fmtShort(snap.nextPeriod, lang)}` : "";
  const nextKey: CopyKey = partner ? (name && name.length <= 10 ? "cyFcNextN" : "cyFcNextP") : "cyFcNext";
  const next = nextDate ? fill(t(nextKey), { d: nextDate, name }) : "";
  if (snap.late > 0) return { lead: dialLine(snap, today, t), next: t("cyFcLate"), late: true };
  const fertileFrom = snap.fertileStart && snap.fertileStart > today ? `${guess}${soon(snap.fertileStart)}` : null;
  if (snap.stage === "period") {
    return { lead: dialLine(snap, today, t), next: fertileFrom ? fill(t("cyFcFertileFrom"), { d: fertileFrom }) : next, late: false };
  }
  if (snap.stage === "ovulation") return { lead: t("cyOvulationToday"), next, late: false };
  if (snap.ovulation && snap.ovulation > today && (snap.stage === "fertile" || snap.stage === "follicular")) {
    const peakFrom = addDays(snap.ovulation, -2);
    if (snap.stage === "follicular" && fertileFrom) return { lead: fill(t("cyFcFertileFrom"), { d: fertileFrom }), next, late: false };
    let lead: string;
    if (peakFrom <= today) lead = daysUntil(today, snap.ovulation) === 1 ? t("cyFcPeakTomorrow") : fill(t("cyFcPeakUntil"), { d: weekday(snap.ovulation) });
    else lead = fill(t("cyFcPeakRange"), { a: weekday(peakFrom), b: weekday(snap.ovulation) });
    return { lead, next, late: false };
  }
  if (snap.stage === "fertile") return { lead: t("cyFcLastFertile"), next, late: false };
  // Luteal: the countdown, then the date.
  return { lead: dialLine(snap, today, t), next, late: false };
}

function RegularityBadge({ regularity, open, onToggle }: { regularity: "learning" | "regular" | "irregular"; open: boolean; onToggle: () => void }) {
  const t = useT();
  const key: CopyKey = regularity === "regular" ? "cyRegular" : regularity === "irregular" ? "cyIrregular" : "cyLearning";
  return (
    <button
      type="button"
      className={cn("cy-badge cy-badge-btn shrink-0", open && "is-open")}
      aria-expanded={open}
      aria-label={`${t(key)} · ${t("cyRegInfoOpen")}`}
      onClick={onToggle}
      data-testid="cycle-regularity"
    >
      {t(key)}
      <ChevronDown className="cy-badge-chev size-3" aria-hidden />
    </button>
  );
}

function RegularityInfo({ stats, measured }: { stats: ReturnType<typeof cycleStats>; measured: number }) {
  const t = useT();
  const n = stats.gaps.length;
  const main =
    stats.regularity === "learning"
      ? fill(t("cyRegInfoLearning"), { usual: Math.round(stats.cycle) })
      : fill(t(stats.regularity === "regular" ? "cyRegInfoRegular" : "cyRegInfoIrregular"), {
          n,
          a: stats.min ?? "",
          b: stats.max ?? "",
          avg: Math.round(stats.cycle),
          w: stats.window,
        });
  const progress = measured >= 6 ? fill(t("cyRegInfoReady"), { n: measured }) : fill(t("cyRegInfoProgress"), { n: measured });
  const filled = Math.min(6, measured);
  return (
    <div className="cy-rise cy-reginfo mt-3 rounded-card border border-border bg-surface-2/60 px-3.5 py-3" data-testid="cycle-reginfo">
      <p className="text-[13px] leading-relaxed text-fg">{main}</p>
      <div className="mt-3 flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className={cn("cy-reg-step", index < filled && "is-on")} />
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-dim">{progress}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-dim">{t("cyRegInfoTip")}</p>
    </div>
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
  return arcPathR(from, to, R);
}

function prefersStill() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Tiny haptic detents (Android / supporting browsers); silent elsewhere and with reduced motion. */
function buzz(ms: number) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function" || prefersStill()) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}

/** Knob angle that follows the finger while dragging and springs onto the chosen day when released. */
function useKnobSpring(target: number, dragging: boolean, finger: number | null) {
  const state = useRef({ angle: target, vel: 0 });
  const raf = useRef(0);
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (dragging && finger !== null) {
      state.current = { angle: finger, vel: 0 };
      force();
      return;
    }
    if (prefersStill()) {
      state.current = { angle: target, vel: 0 };
      force();
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      const k = state.current;
      const diff = ((((target - k.angle) % 360) + 540) % 360) - 180;
      // Spring: stiffness 300, damping 26 (a touch under critical, so it settles with a soft overshoot).
      k.vel += (300 * diff - 26 * k.vel) * dt;
      k.angle += k.vel * dt;
      if (Math.abs(diff) < 0.04 && Math.abs(k.vel) < 0.6) {
        state.current = { angle: target, vel: 0 };
        force();
        return;
      }
      force();
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, dragging, finger]);
  return { angle: state.current.angle, reset: (angle: number) => (state.current = { angle, vel: 0 }) };
}

export function CycleDial({ snap, keyLine, idle }: { snap: Snap; keyLine: string; idle?: ReactNode }) {
  const { t, partner } = useCycleWords();
  const lang = useLang();
  const cycle = useJournal(selectActiveCycle);
  const sessions = useJournal((s) => s.journal.sessions);
  const openCycleDay = useJournal((s) => s.openCycleDay);
  const logPeriodStart = useJournal((s) => s.logPeriodStart);
  const removePeriodStart = useJournal((s) => s.removePeriodStart);
  const setPeriodEnd = useJournal((s) => s.setPeriodEnd);
  const showToast = useJournal((s) => s.showToast);
  const name = cycle.partnerName.trim();
  const today = todayStr();
  const start = snap.cycleStart ?? today;
  const length = Math.max(snap.ringLength, 14);
  const step = 360 / length;
  const gap = Math.min(1.6, step * 0.18);
  const todayIndex = snap.day ? Math.min(snap.day, length) - 1 : 0;
  const marks = useMemo(() => cycleMarks(cycle, start, addDays(start, length - 1), today), [cycle, start, length, today]);
  // Arcs by phase. Only segments wholly in the future are drawn as predictions (dimmer): the phase that
  // holds today, and the days already lived, stay at full strength.
  const runs = useMemo(() => {
    const out: { from: number; to: number; phase: CyclePhase; predicted: boolean }[] = [];
    for (let index = 0; index < length; index += 1) {
      const mark = marks[addDays(start, index)];
      if (!mark || mark.phase === "quiet") continue;
      const last = out[out.length - 1];
      if (last && last.phase === mark.phase && last.to === index) last.to = index + 1;
      else out.push({ from: index, to: index + 1, phase: mark.phase, predicted: false });
    }
    // The fertile window and its ovulation dot count as one segment: a segment that has begun (today is
    // in it, or it is past) is drawn at full strength; only segments that start after today are dimmed.
    const group = (phase: CyclePhase) => (phase === "ovulation" ? "fertile" : phase);
    let groupFrom = 0;
    out.forEach((run, index) => {
      const prev = out[index - 1];
      if (!prev || group(prev.phase) !== group(run.phase) || prev.to !== run.from) groupFrom = run.from;
      run.predicted = groupFrom > todayIndex;
    });
    return out;
  }, [marks, start, length, todayIndex]);
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
  const [sel, setSel] = useState<number | null>(null);
  const selRef = useRef<number | null>(null);
  selRef.current = sel;
  const [dragging, setDragging] = useState(false);
  const [finger, setFinger] = useState<number | null>(null);
  const [hinted, setHinted] = useState(() => {
    try {
      return localStorage.getItem("vela-cy-scrub") === "1";
    } catch {
      return true;
    }
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shown = sel ?? todayIndex;
  const scrubbing = sel !== null && sel !== todayIndex;
  const shownDate = addDays(start, shown);
  // The scrub layer keeps showing its last day while it fades out.
  const lastScrub = useRef(shown);
  if (scrubbing) lastScrub.current = shown;
  const phaseAt = (index: number): CyclePhase => marks[addDays(start, index)]?.phase ?? "quiet";

  function choose(index: number) {
    const next = ((index % length) + length) % length;
    const current = selRef.current ?? todayIndex;
    if (next !== current) buzz(phaseAt(next) !== phaseAt(current) ? 10 : 4);
    selRef.current = next;
    setSel(next);
    if (!hinted) {
      setHinted(true);
      try {
        localStorage.setItem("vela-cy-scrub", "1");
      } catch {
        /* ignore */
      }
    }
  }
  function pointAt(clientX: number, clientY: number) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    const scale = box.width / 240;
    const vx = C + dx / scale;
    const vy = C + dy / scale;
    const dist = Math.hypot(dx, dy) / scale;
    if (!dragging && (dist < R - 30 || dist > R + 30)) return null; // taps start on the ring only
    const angle = ((((Math.atan2(dy, dx) * 180) / Math.PI + 90) % 360) + 360) % 360;
    if (!dragging) {
      // A tap lands on whatever the finger covers: the today moon, the ovulation dot or the knob win
      // over the raw angle, so a fingertip slightly off-centre still picks the day it was aimed at.
      const targets: number[] = [];
      if (snap.day) targets.push(todayIndex);
      if (ovIndex !== null) targets.push(ovIndex);
      if (selRef.current !== null) targets.push(selRef.current);
      let best: { index: number; d: number } | null = null;
      for (const index of targets) {
        const [px, py] = polar(index * step + step / 2);
        const d = Math.hypot(vx - px, vy - py);
        if (d <= 18 && (!best || d < best.d)) best = { index, d };
      }
      if (best) return { angle: best.index * step + step / 2, index: best.index };
      // Otherwise round to the nearest day centre.
      return { angle, index: Math.floor(angle / step) };
    }
    // While dragging, hold the current day until the finger is clearly into the next one (no jitter at edges).
    const current = selRef.current;
    if (current !== null) {
      const centre = current * step + step / 2;
      let delta = Math.abs(angle - centre);
      if (delta > 180) delta = 360 - delta;
      if (delta < step * 0.7) return { angle, index: current };
    }
    return { angle, index: Math.floor(angle / step) };
  }

  const info = scrubbing ? dayInfo(cycle, shownDate, today) : null;
  const stage: CycleStage = info?.stage ?? snap.stage;
  const offset = daysUntil(today, shownDate);
  const relative =
    offset === 0 ? t("cyTodayWord") : offset === 1 ? t("cyIn1") : offset === -1 ? t("cyAgo1") : offset > 0 ? fill(t("cyInN"), { n: offset }) : fill(t("cyAgoN"), { n: -offset });
  const phaseNote = info ? (info.stage === "ovulation" ? t("cyOvulationNote") : info.stage === "fertile" ? t("cyFertileNote") : "") : "";
  const count = moments.get(shown) ?? 0;
  // Lower-chance days (solid: after ovulation; dashed: after the period, before any possibly fertile day).
  // Bounds come from the engine; nothing is drawn until enough cycles are measured to trust them.
  const lowGate = useMemo(() => lowChanceReady(cycle), [cycle]);
  const { low, early } = useMemo(() => (lowGate.ready ? lowChanceDays(cycle, today, length) : { low: null, early: null }), [cycle, today, length, lowGate.ready]);
  const chips = useMemo(() => {
    const out: { key: string; label: CopyKey; dot: string; from: number; to: number }[] = [];
    const first = (phase: CyclePhase) => runs.find((run) => run.phase === phase);
    const period = first("period");
    const fertileRuns = runs.filter((run) => run.phase === "fertile");
    // The window spans the ovulation dot (it includes the day after ovulation): one chip from first to last day.
    const fertile = fertileRuns.length ? { from: fertileRuns[0].from, to: fertileRuns[fertileRuns.length - 1].to } : undefined;
    const ov = first("ovulation");
    if (period) out.push({ key: "period", label: "cyLegendPeriod", dot: "cy-bg-period", from: period.from, to: period.to });
    if (fertile) out.push({ key: "fertile", label: "cyLegendFertile", dot: "cy-bg-fertile", from: fertile.from, to: fertile.to });
    if (ov) out.push({ key: "ovulation", label: "cyLegendOvulation", dot: "cy-bg-ovulation", from: ov.from, to: ov.to });
    if (low) out.push({ key: "low", label: "cyLowTile", dot: "cy-bg-low", from: low.from, to: low.to });
    return out;
  }, [runs, low]);
  const fertileSpan = chips.find((chip) => chip.key === "fertile") ?? null;
  const ovIndex = chips.find((chip) => chip.key === "ovulation")?.from ?? null;
  const inLow = Boolean(low && shown >= low.from && shown < low.to);
  const inEarly = Boolean(early && shown >= early.from && shown < early.to);
  const forecast = useForecast(snap, today);

  // Hint slot: always the same height, so nothing below it moves while scrubbing.
  let hint = "";
  let hintTone = "";
  if (scrubbing) {
    if (phaseNote) {
      hint = phaseNote;
      hintTone = "cy-bg-fertile";
    } else if (inLow) {
      hint = t("cyLowNote");
      hintTone = "cy-bg-low";
    } else if (inEarly) {
      hint = t("cyLowEarlyNote");
      hintTone = "cy-bg-low";
    } else if (!lowGate.ready) hint = t("cyLowLearning");
  } else if (!hinted) hint = t("cyScrubHint");
  else if (lowGate.ready && (low || early)) hint = t("cyLowWhyShort");
  else if (!lowGate.ready) hint = t("cyLowLearning");

  // Scrub actions: the main slot becomes the action for the chosen day, the second is the way back.
  const scrubDay = addDays(start, lastScrub.current);
  const dayLabel = fmtShort(scrubDay, lang);
  let scrubAct: Act | null = null;
  if (scrubDay <= today) {
    const isStart = cycle.starts.includes(scrubDay);
    const container = periodContaining(cycle, scrubDay);
    // Inside the period: up to its logged last day, or a couple of days past the estimate while it is still open.
    const insidePeriod = Boolean(container && scrubDay > container.start && scrubDay <= (container.end ?? addDays(container.estimatedEnd, 2)));
    const isEnd = Boolean(container && cycle.ends[container.start] === scrubDay);
    const startKey: CopyKey = partner ? (name ? "cyStartOnN" : "cyStartOnP") : "cyStartOn";
    const startAct: Act = {
      key: "start",
      icon: "drop",
      label: fill(t(startKey), { d: dayLabel, name }),
      run: () => {
        logPeriodStart(scrubDay);
        showToast(t("cyStartToast"));
        setSel(null);
      },
    };
    if (!partner) {
      const logAct: Act = { key: "log", icon: "log", label: `${cycle.days[scrubDay] ? t("cyEditDay") : t("cyLogDay")} · ${dayLabel}`, run: () => openCycleDay(scrubDay) };
      scrubAct = !isStart && !insidePeriod && nearPeriod(snap, scrubDay) ? startAct : logAct;
    } else if (isStart) {
      scrubAct = { key: "unstart", label: `${t("cycleUnmarkDay")} · ${dayLabel}`, run: () => removePeriodStart(scrubDay) };
    } else if (container && insidePeriod && scrubDay <= today) {
      scrubAct = isEnd
        ? { key: "unend", label: `${t("cyUnmarkEnd")} · ${dayLabel}`, run: () => setPeriodEnd(container.start, null) }
        : {
            key: "end",
            icon: "drop",
            label: fill(t("cyEndOn"), { d: dayLabel }),
            run: () => {
              setPeriodEnd(container.start, scrubDay);
              showToast(t("cyEndToast"));
            },
          };
    } else scrubAct = startAct;
  }
  const scrubLayer = (
    <div className="cy-row flex h-12 gap-2">
      {scrubAct ? <ActButton act={scrubAct} testId="cycle-scrub-act" /> : null}
      <Button variant="ghost" className={cn("cy-btn px-4", scrubAct ? "cy-fixed" : "flex-1")} onClick={() => setSel(null)} aria-label={t("cyBackToday")} data-testid="cycle-back">
        <RotateCcw className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{scrubAct ? t("cyTodayShort") : t("cyBackToday")}</span>
      </Button>
    </div>
  );

  const knobTarget = shown * step + step / 2;
  const knob = useKnobSpring(knobTarget, dragging, finger);
  const showKnob = scrubbing || dragging;
  const [tx, ty] = polar(todayIndex * step + step / 2);
  const [sx, sy] = polar(knob.angle);
  const ticks = Array.from({ length }, (_, index) => index);
  const shownMark = marks[shownDate];
  const weekdayDate = parseDate(shownDate).toLocaleDateString(lang === "es" ? "es" : "en", { weekday: "short", month: "short", day: "numeric" });
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
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            choose(shown + 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            choose(shown - 1);
          } else if (event.key === "Home" || event.key === "Escape") {
            event.preventDefault();
            setSel(null);
          }
        }}
      >
        <CycleSky length={length} today={todayIndex} fertile={fertileSpan} ovulation={ovIndex} />
        <svg
          ref={svgRef}
          viewBox="0 0 240 240"
          aria-hidden
          className="cy-dial-svg"
          onPointerDown={(event) => {
            const hit = pointAt(event.clientX, event.clientY);
            if (!hit) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            if (!scrubbing) knob.reset(todayIndex * step + step / 2);
            setDragging(true);
            setFinger(hit.angle);
            choose(hit.index);
          }}
          onPointerMove={(event) => {
            if (!dragging) return;
            const hit = pointAt(event.clientX, event.clientY);
            if (!hit) return;
            setFinger(hit.angle);
            choose(hit.index);
          }}
          onPointerUp={() => {
            setDragging(false);
            setFinger(null);
          }}
          onPointerCancel={() => {
            setDragging(false);
            setFinger(null);
          }}
        >
          <defs>
            <radialGradient id="cy-moon" cx="38%" cy="34%" r="70%">
              <stop offset="0%" stopColor="var(--cy-moon-hi)" />
              <stop offset="55%" stopColor="var(--ag-accent)" />
              <stop offset="100%" stopColor="var(--cy-moon-lo)" />
            </radialGradient>
            <radialGradient id="cy-moon-halo">
              <stop offset="0%" stopColor="var(--ag-accent)" stopOpacity=".55" />
              <stop offset="45%" stopColor="var(--ag-accent)" stopOpacity=".18" />
              <stop offset="100%" stopColor="var(--ag-accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--cy-track)" strokeWidth={STROKE} />
          {ticks.map((index) => {
            const [x1, y1] = polar(index * step, R - STROKE / 2 - 5);
            const [x2, y2] = polar(index * step, R - STROKE / 2 - (index % 7 === 0 ? 10 : 7));
            return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ag-dim)" strokeOpacity={index % 7 === 0 ? 0.5 : 0.2} strokeWidth={1} strokeLinecap="round" />;
          })}
          <g className="cy-arcs">
            {runs
              .filter((run) => run.phase !== "ovulation")
              .map((run) => (
                <path
                  key={`${run.from}-${run.phase}`}
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
                return <circle key={`ov-${run.from}`} cx={ox} cy={oy} r={STROKE / 2 + 2} className={cn("cy-ov-dot", run.predicted && "cy-ov-pred")} />;
              })}
          </g>
          {low ? (
            <path d={arcPathR(low.from * step + gap / 2, low.to * step, R + STROKE / 2 + 2.6)} fill="none" strokeWidth={2.4} strokeLinecap="round" className={cn("cy-arc-low", inLow && scrubbing && "is-lit")} data-testid="cycle-low-arc" />
          ) : null}
          {early ? (
            <path d={arcPathR(early.from * step + gap / 2, early.to * step - gap / 2, R + STROKE / 2 + 2.6)} fill="none" strokeWidth={2.4} strokeLinecap="round" className={cn("cy-arc-low cy-arc-early", inEarly && scrubbing && "is-lit")} data-testid="cycle-early-arc" />
          ) : null}
          <g className="cy-moments">
            {[...moments.keys()].map((index) => {
              const [mx, my] = polar(index * step + step / 2, R + STROKE / 2 + 8.5);
              return <circle key={`m-${index}`} cx={mx} cy={my} r={moments.get(index)! > 1 ? 2.4 : 1.8} className="cy-moment" />;
            })}
          </g>
          {snap.day ? (
            <g className="cy-today">
              <circle cx={tx} cy={ty} r={17} fill="url(#cy-moon-halo)" className="cy-today-halo" />
              <circle cx={tx} cy={ty} r={7.5} fill="url(#cy-moon)" className="cy-today-dot" />
            </g>
          ) : null}
          {showKnob ? (
            <g className="cy-knob">
              <circle cx={sx} cy={sy} r={11.5} className={cn("cy-knob-ring", shownMark && shownMark.phase !== "quiet" && `cy-knob-${shownMark.phase}`)} />
              <circle cx={sx} cy={sy} r={3.6} className="cy-knob-core" />
            </g>
          ) : null}
        </svg>
        <button type="button" className={cn("cy-center", scrubbing && "is-scrub")} tabIndex={-1} aria-hidden onClick={() => setSel(null)}>
          <span key={scrubbing ? shownDate : "today"} className="cy-center-in">
            <span className={cn("max-w-full truncate text-[10px] font-semibold text-dim uppercase", scrubbing ? "tracking-[0.08em]" : "tracking-[0.22em]")}>
              {scrubbing ? weekdayDate : t("cycleDay")}
            </span>
            <span className="cy-num font-display tabular-nums" data-testid="cycle-day">
              {scrubbing ? shown + 1 : (snap.day ?? "—")}
            </span>
            <span className="flex max-w-full items-center gap-1.5 text-[13px] font-semibold">
              <span className={cn("size-2 shrink-0 rounded-full", stageDot(stage))} />
              <span className="truncate">{t(stageKey(stage))}</span>
            </span>
            <span className={cn("cy-forecast", forecast.late && !scrubbing && "is-late")} data-testid="cycle-forecast">
              {scrubbing ? (
                <>
                  <span>{relative}</span>
                  <span className="text-dim">{offset > 0 ? t("cyLegendPredicted").toLowerCase() : count > 0 ? (count === 1 ? t("cyMoment1") : fill(t("cyMomentsN"), { n: count })) : "\u00a0"}</span>
                </>
              ) : (
                <>
                  <span>{forecast.lead}</span>
                  <span className="text-dim">{forecast.next || "\u00a0"}</span>
                </>
              )}
            </span>
          </span>
        </button>
      </div>
      <div className="cy-legend" data-testid="cycle-phase-chips">
        {chips.map((chip) => {
          const on = scrubbing && shown >= chip.from && shown < chip.to;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => choose(chip.from)}
              className={cn("cy-chip", on && "is-on")}
              data-chip={chip.key}
              aria-label={`${t("cyJumpTo")} ${t(chip.label)}`}
              aria-pressed={on}
            >
              <span className={cn("cy-chip-dot", chip.dot)} />
              <span>{t(chip.label)}</span>
              <span className="cy-chip-num tabular-nums text-dim">{chip.to - chip.from > 1 ? `${chip.from + 1}–${chip.to}` : chip.from + 1}</span>
            </button>
          );
        })}
      </div>
      <p className="cy-hint" data-testid="cycle-hint" aria-live="polite">
        <span key={hint} className="cy-hint-in">
          {hintTone ? <span className={cn("cy-hint-dot", hintTone)} aria-hidden /> : null}
          {hint}
        </span>
      </p>
      <div className="cy-slot" data-scrub={scrubbing ? "1" : "0"}>
        <div className="cy-layer" data-on={!scrubbing} inert={scrubbing || undefined} aria-hidden={scrubbing || undefined}>
          {idle}
        </div>
        <div className="cy-layer" data-on={scrubbing} inert={!scrubbing || undefined} aria-hidden={!scrubbing || undefined}>
          {scrubLayer}
        </div>
      </div>
    </div>
  );
}

/* ── 7-day strip ────────────────────────────────────────────────────────── */

function weekMark(mark: DayMark | undefined) {
  if (!mark) return "";
  if (mark.phase === "period") return mark.predicted ? "cy-wk-period-pred" : "cy-wk-period";
  if (mark.phase === "ovulation") return "cy-wk-ovulation";
  if (mark.phase === "fertile") return "cy-wk-fertile";
  return "";
}

function WeekStrip({ picked, onPick }: { picked: string | null; onPick: (ds: string) => void }) {
  const lang = useLang();
  const cycle = useJournal(selectActiveCycle);
  const partner = cycle.perspective === "partner";
  const today = todayStr();
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 3));
  const marks = cycleMarks(cycle, days[0], days[6], today);
  return (
    <div className="mt-4 grid grid-cols-7 gap-1 border-t border-border pt-3" data-testid="cycle-week">
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
            className={cn("cy-week-day flex flex-col items-center gap-1 rounded-xl py-1", picked === ds && "bg-surface-2")}
          >
            <span className={cn("text-[10px] font-semibold uppercase", ds === today ? "text-accent" : "text-dim", future && "opacity-60")}>
              {parsed.toLocaleDateString(lang === "es" ? "es" : "en", { weekday: "narrow" })}
            </span>
            <span className={cn("cy-wk grid size-8 place-items-center rounded-full text-[13px] font-semibold tabular-nums", weekMark(mark), ds === today && "cy-wk-today", future && "is-future")}>
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
  const cycle = useJournal(selectActiveCycle);
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
  const cycle = useJournal(selectActiveCycle);
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
      <TrackerSwitch className="mb-3" />
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

export function CycleTune({ id }: { id?: string } = {}) {
  const t = useT();
  const active = useJournal(selectActiveCycle);
  const picked = useJournal((s) => (id ? s.journal.settings.cycles.find((tracker) => tracker.id === id) : undefined));
  const cycle = picked ?? active;
  const store = useJournal((s) => s.setCycle);
  const setCycle = (partial: Parameters<typeof store>[0]) => store(partial, cycle.id);
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
  const cycle = useJournal(selectActiveCycle);
  const sessions = useJournal((s) => s.journal.sessions);
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const openPhase = useJournal((s) => s.openHistPhase);
  const [regInfo, setRegInfo] = useState(false);
  if (!cycle.enabled || cycle.starts.length === 0) return null;
  const today = todayStr();
  const snap = cycleSnapshot(cycle, today);
  const stats = cycleStats(cycle);
  const history = pastCycles(cycle, 6);
  // Each moment is read against its own tracker (its partner's cycle, else the user's own).
  const counts = sessionsByPhaseFor(cycles, sessions, today);
  const multi = visibleTrackers(cycles).length > 1;
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
      <TrackerSwitch className="mb-3" />
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-2xl">{w("cyTitle")}</h2>
        <RegularityBadge regularity={stats.regularity} open={regInfo} onToggle={() => setRegInfo((open) => !open)} />
      </div>
      {regInfo ? <RegularityInfo stats={stats} measured={lowChanceReady(cycle).measured} /> : null}
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
                <span className="cy-cbar relative flex w-full max-w-9 flex-col overflow-hidden rounded-[10px]" style={{ height: `${Math.round((row.length / longest) * 96)}px` }}>
                  <span className={cn("block w-full cy-bg-period", !row.periodLogged && "opacity-60")} style={{ height: `${Math.round((row.period / row.length) * 100)}%` }} />
                </span>
                <span className="w-full truncate text-center text-[10px] text-dim">{fmtShort(row.start, lang)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <p className="mt-4 text-sm font-semibold">{t("cycleInMoments")}</p>
      {multi ? <p className="mt-1 text-xs leading-relaxed text-dim">{t("cyMomentsRule")}</p> : null}
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
              <span className={cn("cy-mbar block h-full max-w-full rounded-full", `is-${row.phase}`)} style={{ width: `${Math.max(row.value > 0 ? 8 : 0, Math.round((row.value / max) * 100))}%` }} />
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
  const cycle = useJournal(selectActiveCycle);
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
  const log = useJournal((s) => selectActiveCycle(s).days[date]);
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

export function SessionPhaseChip({ date, partner = "" }: { date: string; partner?: string }) {
  const t = useT();
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const cycle = trackerForPartner(cycles, partner);
  if (!cycle || !cycle.enabled || cycle.starts.length === 0) return null;
  const info = dayInfo(cycle, date, todayStr());
  if (!info) return null;
  // With several cycles followed, the chip says whose cycle it read.
  const whose = visibleTrackers(cycles).length > 1 ? trackerLabel(cycle, t) : "";
  const note = info.stage === "ovulation" ? t("cyOvulationNote") : info.stage === "fertile" ? t("cyFertileNote") : "";
  return (
    <div className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="session-phase">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold">
        <span className={cn("size-2 rounded-full", stageDot(info.stage))} />
        {t(stageKey(info.stage))}
        {info.cycleDay ? <span className="font-medium text-dim">· {t("cycleDay")} {info.cycleDay}</span> : null}
        {whose ? <span className="max-w-[8rem] truncate font-medium text-dim" data-testid="session-phase-whose">· {whose}</span> : null}
      </span>
      {note ? <span className="cy-text-fertile text-xs font-medium leading-snug">{note}</span> : null}
    </div>
  );
}

/* ── History: one small dot per entry ───────────────────────────────────── */

export function PhaseDot({ date, partner = "", className }: { date: string; partner?: string; className?: string }) {
  const t = useT();
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const cycle = trackerForPartner(cycles, partner);
  if (!cycle || !cycle.enabled || cycle.starts.length === 0) return null;
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
  const cycle = useJournal(selectActiveCycle);
  const discreet = useJournal((s) => s.journal.settings.discreet);
  const setCycleSheet = useJournal((s) => s.setCycleSheet);
  const multi = useJournal((s) => visibleTrackers(s.journal.settings.cycles).length > 1);
  if (!cycle.enabled || cycle.starts.length === 0) return null;
  const snap = cycleSnapshot(cycle, todayStr());
  if (!snap.day) return null;
  const whose = multi ? trackerLabel(cycle, t) : "";
  return (
    <button type="button" className="cy-pill" aria-label={whose ? `${t("cyOpenCycle")} · ${whose}` : t("cyOpenCycle")} onClick={() => setCycleSheet(true)} data-testid="cycle-pill">
      <span className={cn("size-1.5 rounded-full", stageDot(snap.stage))} />
      {whose ? (
        <>
          <span className="max-w-[4.5rem] truncate" data-testid="cycle-pill-whose">{whose}</span>
          <span className="text-dim">·</span>
        </>
      ) : null}
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
  const cycle = useJournal(selectActiveCycle);
  const multi = useJournal((s) => visibleTrackers(s.journal.settings.cycles).length > 1);
  const whoseName = cycle.perspective === "partner" ? trackerLabel(cycle, t) : "";
  const whose = multi ? (whoseName ? fill(t("cyLegendOf"), { name: whoseName }) : t("cyLegendOfSelf")) : "";
  const items: { key: CopyKey; cls: string }[] = [
    { key: "cyLegendPeriod", cls: "cy-mark-period" },
    { key: "cyLegendPredicted", cls: "cy-mark-period-pred" },
    { key: "cyLegendFertile", cls: "cy-mark-fertile" },
    { key: "cyLegendOvulation", cls: "cy-mark-ovulation" },
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-dim" data-testid="cycle-legend">
      {whose ? (
        <span className="w-full truncate text-center font-semibold" data-testid="cycle-legend-whose">
          {whose}
        </span>
      ) : null}
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span className={cn("cy-week-num inline-block size-3 rounded-full", item.cls)} />
          {t(item.key)}
        </span>
      ))}
    </div>
  );
}
