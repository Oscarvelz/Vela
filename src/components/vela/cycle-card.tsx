import { useState } from "react";
import { Droplets } from "lucide-react";
import { cycleLengthOf, cycleSnapshot, phaseOn, sessionsByPhase, type CyclePhase } from "@/lib/vela/cycle";
import type { CopyKey } from "@/lib/vela/copy";
import { addDays, fmtShort, parseDate, todayStr } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import { cn } from "@/lib/cn";
import { Button, Card } from "./ui";

const PHASE_KEY: Record<CyclePhase, CopyKey> = {
  period: "cyclePeriod",
  fertile: "cycleFertile",
  ovulation: "cycleOvulation",
  quiet: "cycleQuiet",
};

export function phaseKey(phase: CyclePhase) {
  return PHASE_KEY[phase];
}

export function CycleCard() {
  const t = useT();
  const lang = useLang();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const setCycle = useJournal((s) => s.setCycle);
  const logPeriodStart = useJournal((s) => s.logPeriodStart);
  const removePeriodStart = useJournal((s) => s.removePeriodStart);
  const [tune, setTune] = useState(false);
  const today = todayStr();
  const snap = cycleSnapshot(cycle, today);
  const days = Array.from({ length: 21 }, (_, index) => addDays(today, index - 20));
  if (!cycle.enabled) {
    return (
      <div className="ag-panel rounded-card border border-border px-4 py-4">
        <p className="flex items-center gap-2 font-display text-2xl">
          <Droplets className="size-4 text-accent" />
          {t("cycleTitle")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-dim">{t("cycleBody")}</p>
        <Button className="mt-3" onClick={() => setCycle({ enabled: true })}>
          {t("cycleEnable")}
        </Button>
      </div>
    );
  }
  const detail = !snap.hasStarts
    ? t("cycleNoStarts")
    : snap.phase === "period"
      ? `${t("cycleDay")} ${snap.day} ${t("cycleOf")} ${cycle.periodDays} · ${t("cyclePeriodThrough")} ${fmtShort(snap.periodEnd || today, lang)}`
      : snap.phase === "fertile" || snap.phase === "ovulation"
        ? `${t("cycleFertileThrough")} ${fmtShort(snap.ovulation || today, lang)}`
        : snap.fertileStart && snap.fertileStart > today
          ? `${t("cycleWindowOn")} ${fmtShort(snap.fertileStart, lang)}`
          : snap.nextPeriod
            ? `${t("cycleNextPeriod")} ${fmtShort(snap.nextPeriod, lang)}`
            : t("cycleHomeHint");
  return (
    <div className="ag-panel rounded-card border border-border px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1 size-2.5 shrink-0 rounded-full",
            snap.phase === "period" ? "bg-wine" : snap.phase === "quiet" ? "bg-dim/40" : "bg-accent",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-dim uppercase">{t("cycleTitle")}</p>
          <h3 className="font-display text-2xl leading-tight">{snap.hasStarts ? t(phaseKey(snap.phase)) : t("cycleTitle")}</h3>
          <p className="mt-1 text-sm leading-relaxed text-dim">{detail}</p>
        </div>
      </div>
      {snap.startedToday ? (
        <p className="mt-3 text-sm text-accent">{t("cycleAlready")}</p>
      ) : null}
      <p className="mt-3 text-sm font-semibold">{t("cyclePick")}</p>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {days.map((date) => {
          const on = cycle.starts.includes(date);
          const parsed = parseDate(date);
          return (
            <button
              key={date}
              type="button"
              aria-pressed={on}
              onClick={() => (on ? removePeriodStart(date) : logPeriodStart(date))}
              className={cn(
                "flex min-h-12 min-w-11 shrink-0 flex-col items-center justify-center rounded-xl border px-1 text-center",
                on ? "border-accent bg-surface-2 text-fg" : "border-border text-dim",
              )}
            >
              <span className="text-[10px] uppercase">{parsed.toLocaleDateString(lang === "es" ? "es" : "en", { weekday: "narrow" })}</span>
              <span className="text-sm font-semibold tabular-nums">{parsed.getDate()}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="mt-2 text-sm font-semibold text-accent" onClick={() => setTune((open) => !open)}>
        {t("cycleTune")}
      </button>
      {tune ? <CycleTune /> : null}
    </div>
  );
}

export function CycleTune() {
  const t = useT();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const setCycle = useJournal((s) => s.setCycle);
  return (
    <div className="mt-3 space-y-3">
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
      <button type="button" className="grid size-9 place-items-center rounded-full border border-border" onClick={() => onChange(Math.max(min, value - 1))} aria-label={label}>
        –
      </button>
      <span className="w-14 text-center text-sm tabular-nums">
        {value} {suffix}
      </span>
      <button type="button" className="grid size-9 place-items-center rounded-full border border-border" onClick={() => onChange(Math.min(max, value + 1))} aria-label={label}>
        +
      </button>
    </div>
  );
}

export function CycleStats() {
  const t = useT();
  const lang = useLang();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  const sessions = useJournal((s) => s.journal.sessions);
  const openPhase = useJournal((s) => s.openHistPhase);
  if (!cycle.enabled || cycle.starts.length === 0) return null;
  const today = todayStr();
  const snap = cycleSnapshot(cycle, today);
  const counts = sessionsByPhase(cycle, sessions.map((session) => session.date), today);
  const best = counts.fertile + counts.ovulation;
  const length = cycleLengthOf(cycle);
  const rows: { phase: "period" | "fertile" | "quiet"; label: string; value: number }[] = [
    { phase: "period", label: t("cyclePeriod"), value: counts.period },
    { phase: "fertile", label: t("cycleFertile"), value: best },
    { phase: "quiet", label: t("cyclePhaseQuiet"), value: counts.quiet },
  ];
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <Card className="min-w-0 overflow-hidden">
      <h2 className="font-display text-2xl">{t("cycleTitle")}</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini value={String(cycle.starts.length)} label={t("cyclePeriodsLogged")} />
        <Mini value={String(length)} label={t("cycleAvgLen")} />
        <Mini value={snap.nextPeriod ? fmtShort(snap.nextPeriod, lang) : "—"} label={t("cycleNextPeriod")} />
      </div>
      <p className="mt-4 text-sm font-semibold">{t("cycleInMoments")}</p>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <button key={row.phase} type="button" className="block w-full min-w-0 text-left" onClick={() => openPhase(row.phase)}>
            <span className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold">{row.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-dim">{row.value}</span>
            </span>
            <span className="block h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <span className="ag-liquid block h-full max-w-full rounded-full" style={{ width: `${Math.max(row.value > 0 ? 8 : 0, Math.round((row.value / max) * 100))}%` }} />
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-border bg-surface-2 px-2 py-3 text-center">
      <b className="block truncate font-display text-xl tabular-nums leading-none text-accent">{value}</b>
      <span className="mt-1.5 block truncate text-[10px] text-dim">{label}</span>
    </div>
  );
}

export function CycleDayLine({ date }: { date: string }) {
  const t = useT();
  const cycle = useJournal((s) => s.journal.settings.cycle);
  if (!cycle.enabled || cycle.starts.length === 0) return null;
  const phase = phaseOn(cycle, date);
  return <p className="mt-1 text-sm text-accent">{t(phaseKey(phase))}</p>;
}
