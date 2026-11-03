import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { FLOWS, MOODS, SYMPTOMS, dayInfo, type DayLog, type Flow } from "@/lib/vela/cycle";
import { stageKey, useCycleWords } from "@/lib/vela/cycle-words";
import { fmtDate, todayStr } from "@/lib/vela/dates";
import { useLang } from "@/lib/vela/i18n";
import { selectActiveCycle, useJournal } from "@/lib/vela/store";
import { cn } from "@/lib/cn";
import { CycleCard, FLOW_KEY, MOOD_KEY, PeriodDateActions, SYMPTOM_KEY, ToggleChip, stageDot } from "./cycle-card";
import { Button, fieldClass } from "./ui";
import { useBackLayer } from "@/lib/vela/back-stack";

function Sheet({ label, onClose, children, z = "z-50", testId }: { label: string; onClose: () => void; children: ReactNode; z?: string; testId?: string }) {
  // Back / gesture / Escape close the sheet; its close button removes its history entry (back-stack).
  useBackLayer(true, onClose, { name: testId ?? "sheet" });
  return (
    <div className={cn("cy-scrim fixed inset-0 flex items-end justify-center bg-black/55 sm:items-center", z)} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-noswipe
        data-testid={testId}
        className="cy-sheet ag-panel max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-sheet border border-border px-4 pt-3 pb-6 sm:rounded-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-fg/15 sm:hidden" />
        {children}
      </div>
    </div>
  );
}

/** Mounted once in the shell: the cycle sheet (from the header pill) and the day log sheet. */
export function CycleLayers() {
  const sheet = useJournal((s) => s.cycleSheet);
  const day = useJournal((s) => s.cycleDay);
  const partner = useJournal((s) => selectActiveCycle(s).perspective === "partner");
  const enabled = useJournal((s) => selectActiveCycle(s).enabled);
  const setSheet = useJournal((s) => s.setCycleSheet);
  const openDay = useJournal((s) => s.openCycleDay);
  return (
    <>
      {sheet && enabled ? <CycleSheet onClose={() => setSheet(false)} /> : null}
      {/* Partner mode never shows the day log: he only knows the dates she shares. */}
      {day && enabled && !partner ? <DayLogSheet key={day} date={day} onClose={() => openDay(null)} /> : null}
    </>
  );
}

function CycleSheet({ onClose }: { onClose: () => void }) {
  const { w } = useCycleWords();
  return (
    <Sheet label={w("cyTitle")} onClose={onClose} testId="cycle-sheet">
      <CycleCard inSheet onClose={onClose} />
    </Sheet>
  );
}

const FLOW_DROPS: Record<Flow, number> = { spotting: 1, light: 2, medium: 3, heavy: 4 };

function DayLogSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { t } = useCycleWords();
  const lang = useLang();
  const cycle = useJournal(selectActiveCycle);
  const logCycleDay = useJournal((s) => s.logCycleDay);
  const showToast = useJournal((s) => s.showToast);
  const log: DayLog = cycle.days[date] ?? {};
  const [note, setNote] = useState(log.note ?? "");
  const info = dayInfo(cycle, date, todayStr());
  const noteRef = useRef(note);
  noteRef.current = note;

  const save = (next: Partial<DayLog>) => logCycleDay(date, { ...log, note: noteRef.current, ...next });
  const finish = () => {
    if ((log.note ?? "") !== noteRef.current.trim()) save({});
    onClose();
  };
  const toggleSymptom = (item: (typeof SYMPTOMS)[number]) => {
    const list = log.symptoms ?? [];
    // High and low libido exclude each other.
    const without = list.filter((value) => value !== item && !(item === "libidoHigh" && value === "libidoLow") && !(item === "libidoLow" && value === "libidoHigh"));
    save({ symptoms: list.includes(item) ? without : [...without, item] });
  };
  const has = Boolean(cycle.days[date]);

  return (
    <Sheet label={t("cyDayLogTitle")} onClose={finish} z="z-[60]" testId="day-log">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[0.16em] text-dim uppercase">{t("cyDayLogTitle")}</p>
          <h2 className="font-display text-[1.7rem] leading-tight">{fmtDate(date, lang)}</h2>
          {info ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-dim">
              <span className={cn("size-2 rounded-full", stageDot(info.stage))} />
              {t(stageKey(info.stage))}
              {info.cycleDay ? ` · ${t("cycleDay")} ${info.cycleDay}` : ""}
            </p>
          ) : null}
        </div>
        <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-dim" aria-label={t("closeEdit")} onClick={finish}>
          <X className="size-5" />
        </button>
      </div>

      <div className="mt-4">
        <PeriodDateActions date={date} />
      </div>

      <Section title={t("cyFlow")}>
        <div className="grid grid-cols-4 gap-1.5">
          {FLOWS.map((flow) => {
            const on = log.flow === flow;
            return (
              <button
                key={flow}
                type="button"
                aria-pressed={on}
                onClick={() => save({ flow: on ? undefined : flow })}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 text-[11px] font-semibold",
                  on ? "ag-chip-on" : "ag-pill border-border text-fg",
                )}
              >
                <span className="flex items-end gap-[2px]" aria-hidden>
                  {[1, 2, 3, 4].map((level) => (
                    <Drop key={level} filled={level <= FLOW_DROPS[flow]} />
                  ))}
                </span>
                {t(FLOW_KEY[flow])}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t("cySymptoms")}>
        <div className="flex flex-wrap gap-1.5">
          {SYMPTOMS.map((item) => (
            <ToggleChip key={item} on={Boolean(log.symptoms?.includes(item))} onClick={() => toggleSymptom(item)}>
              {t(SYMPTOM_KEY[item])}
            </ToggleChip>
          ))}
        </div>
      </Section>

      <Section title={t("cyMood")}>
        <div className="flex flex-wrap gap-1.5">
          {MOODS.map((item) => (
            <ToggleChip key={item} on={log.mood === item} onClick={() => save({ mood: log.mood === item ? undefined : item })}>
              {t(MOOD_KEY[item])}
            </ToggleChip>
          ))}
        </div>
      </Section>

      <Section title={t("cyNote")}>
        <textarea
          className={cn(fieldClass, "min-h-20 resize-none text-sm")}
          value={note}
          maxLength={600}
          placeholder={t("cyNotePh")}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => save({})}
        />
      </Section>

      <div className="mt-5 flex gap-2">
        <Button
          className="flex-1"
          onClick={() => {
            if ((log.note ?? "") !== noteRef.current.trim()) save({});
            if (cycle.days[date] || noteRef.current.trim()) showToast(t("cyLoggedToast"));
            onClose();
          }}
        >
          {t("cyDone")}
        </Button>
        {has ? (
          <Button
            variant="ghost"
            onClick={() => {
              setNote("");
              noteRef.current = "";
              logCycleDay(date, null);
            }}
          >
            {t("cyClearDay")}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {children}
    </section>
  );
}

function Drop({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 10 13" className="h-3 w-[9px]">
      <path
        d="M5 .8C3.6 3 1.2 5.6 1.2 8.2a3.8 3.8 0 0 0 7.6 0C8.8 5.6 6.4 3 5 .8Z"
        fill={filled ? "var(--cy-period)" : "none"}
        stroke="var(--cy-period)"
        strokeOpacity={filled ? 1 : 0.5}
        strokeWidth="1.1"
      />
    </svg>
  );
}
