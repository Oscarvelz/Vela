/* The cycle question (2.2.1) — when a completed cycle escapes the woman's
   own pattern, Vela asks once whether she knows a reason, and keeps only
   what she says. The question states measured facts and nothing else: no
   cause is named in it, no option is preselected, and both an answer and a
   dismissal are recorded as data — the question never returns for a cycle
   that has been answered or put away. On a partner's tracker the keeper's
   answer is the journal's annotation, in his words; it is never rendered
   as her statement. */
import { useState } from "react";
import type { CopyKey } from "@/lib/vela/copy";
import { cycleAsk, cycleOutlier, pastCycles, CYCLE_REASON_IDS, type CycleAsk, type CycleReasonId } from "@/lib/vela/cycle";
import { fill } from "@/lib/vela/cycle-words";
import { useT } from "@/lib/vela/i18n";
import { selectActiveCycle, useJournal } from "@/lib/vela/store";
import { Button, fieldClass } from "./ui";
import { Hint } from "./hint";
import { cn } from "@/lib/cn";

export const REASON_KEY: Record<CycleReasonId, CopyKey> = {
  morningAfter: "cyResMorningAfter",
  contraceptionChange: "cyResContraception",
  medication: "cyResMedication",
  stress: "cyResStress",
  travel: "cyResTravel",
  exercise: "cyResExercise",
  illness: "cyResIllness",
  weight: "cyResWeight",
  postpartum: "cyResPostpartum",
  pregnancyEnd: "cyResPregnancyEnd",
  perimenopause: "cyResPerimenopause",
  pregnant: "cyResPregnant",
  other: "cyResOther",
  unknown: "cyResUnknown",
};

function questionText(ask: CycleAsk, t: (key: CopyKey) => string): string {
  if (ask.low < ask.high) {
    return fill(t(ask.longer ? "cyAskLongerRange" : "cyAskShorterRange"), { n: ask.length, a: ask.low, b: ask.high });
  }
  return fill(t(ask.longer ? "cyAskLongerOne" : "cyAskShorterOne"), { n: ask.length, u: ask.low });
}

export function CycleReasonAsk() {
  const t = useT();
  const cycle = useJournal(selectActiveCycle);
  const speakAs = useJournal((s) => s.journal.profile?.speakAs);
  const setCycle = useJournal((s) => s.setCycle);
  const showToast = useJournal((s) => s.showToast);
  // The pregnancy reason speaks in first person only when the cycle is the
  // keeper's own and the keeper is not a man (Oscar, 2026-11-14): on a
  // partner's tracker — his account of her cycle — the plain noun is the
  // honest word: "Pregnancy" / «Embarazo», never "I'm pregnant".
  const firstPerson = cycle.perspective === "self" && speakAs !== "man";
  const reasonLabel = (id: CycleReasonId): string =>
    id === "pregnant" && !firstPerson ? t("cyResPregnancy") : t(REASON_KEY[id]);
  const [editing, setEditing] = useState<string | null>(null);
  const [sel, setSel] = useState<CycleReasonId | null>(null);
  const [note, setNote] = useState("");

  if (!cycle.enabled) return null;
  const reasons = cycle.reasons ?? {};
  const ask = cycleAsk(cycle);

  // The latest answered cycle (an answer, not a dismissal or an unknown)
  // speaks quietly on the card, and can be corrected.
  const rows = pastCycles(cycle, 12);
  let noted: { start: string; label: string } | null = null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const reason = reasons[rows[i].start];
    if (reason && reason.id !== "dismissed" && reason.id !== "unknown") {
      noted = {
        start: rows[i].start,
        label: reason.id === "other" && reason.note ? reason.note : reasonLabel(reason.id as CycleReasonId),
      };
      break;
    }
  }

  const target = editing ?? ask?.cycleStart ?? null;
  const targetInfo = target ? cycleOutlier(cycle, target) ?? ask : null;

  const write = (start: string, reason: { id: CycleReasonId | "dismissed"; note?: string }) => {
    setCycle({ reasons: { ...reasons, [start]: { ...reason, at: Date.now() } } }, cycle.id);
  };

  const openEditor = (start: string) => {
    const current = reasons[start];
    setSel(current && current.id !== "dismissed" ? (current.id as CycleReasonId) : null);
    setNote(current?.note ?? "");
    setEditing(start);
  };

  if (target && targetInfo) {
    const isAsk = !reasons[target];
    return (
      <div className="mt-3 rounded-2xl border border-accent/35 bg-surface-2/45 px-3.5 py-3" data-testid="cycle-ask">
        <p className="flex items-start gap-2 text-sm leading-relaxed"><span className="flex-1">{questionText(targetInfo, t)}</span><Hint topic="el-ciclo-pregunta" compact /></p>
        <p className="mt-1 text-sm leading-relaxed text-dim">{t("cyAskBody")}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {CYCLE_REASON_IDS.map((id) => (
            <button
              key={id}
              type="button"
              data-noswipe
              data-reason={id}
              className={cn(
                "rounded-full border border-border px-3 py-1.5 text-sm transition",
                sel === id && "ag-chip-on border-transparent font-semibold",
              )}
              onClick={() => setSel(sel === id ? null : id)}
            >
              {reasonLabel(id)}
            </button>
          ))}
        </div>
        {sel === "other" ? (
          <input
            className={cn(fieldClass, "mt-2.5")}
            value={note}
            maxLength={80}
            placeholder={t("cyResNotePh")}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : null}
        <div className="mt-3 flex gap-2">
          {isAsk ? (
            <Button
              variant="ghost"
              className="min-h-10 px-3 text-sm"
              data-testid="cycle-ask-later"
              onClick={() => {
                // A dismissal is data (2.2.1): this cycle is never asked again.
                write(target, { id: "dismissed" });
                setEditing(null);
              }}
            >
              {t("cyAskNotNow")}
            </Button>
          ) : (
            <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={() => setEditing(null)}>
              {t("cancelBtn")}
            </Button>
          )}
          <Button
            className="min-h-10 flex-1 px-3 text-sm"
            data-testid="cycle-ask-save"
            disabled={!sel}
            onClick={() => {
              if (!sel) return;
              write(target, { id: sel, ...(sel === "other" && note.trim() ? { note: note.trim() } : {}) });
              showToast(t("cyAskSavedToast"));
              setEditing(null);
            }}
          >
            {t("cyAskSave")}
          </Button>
        </div>
      </div>
    );
  }

  if (noted) {
    return (
      <div className="mt-3 flex items-center gap-2" data-testid="cycle-noted">
        <p className="min-w-0 flex-1 truncate text-sm text-dim">{fill(t("cyNotedLine"), { reason: noted.label })}</p>
        <button
          type="button"
          data-noswipe
          className="shrink-0 text-xs font-semibold text-dim active:opacity-70"
          onClick={() => openEditor(noted!.start)}
        >
          {t("edit")}
        </button>
      </div>
    );
  }

  return null;
}
