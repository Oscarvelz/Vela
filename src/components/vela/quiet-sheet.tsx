/* Quiet days (2.2.4) — the Calendar's way of closing a silence with a name.
   The day panel carries either the mark itself (a quiet card: the word, the
   stretch in words, the note) or one subordinate action that offers to name
   the day. The sheet makes a stretch by moving To — there is no separate
   range mode — and its chips are the settled seven, plus the user's own
   words. Nothing here accuses: a mark is the journal speaking. */
import { useState } from "react";
import { createPortal } from "react-dom";
import type { CopyKey } from "@/lib/vela/copy";
import { fill } from "@/lib/vela/cycle-words";
import { fmtDate, fmtRange } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { markOn, QUIET_REASONS } from "@/lib/vela/quiet";
import { useJournal } from "@/lib/vela/store";
import type { QuietMark, QuietThemeId } from "@/lib/vela/types";
import { useBackLayer } from "@/lib/vela/back-stack";
import { Button, ConfirmDialog, fieldClass } from "./ui";
import { Hint } from "./hint";
import { cn } from "@/lib/cn";

export const QUIET_REASON_KEY: Record<QuietThemeId, CopyKey> = {
  work: "qdWork",
  travel: "qdTravel",
  kids: "qdKids",
  health: "qdHealth",
  argued: "qdArgued",
  distance: "qdDistance",
  life: "qdLife",
  communication: "qdCommunication",
  school: "qdSchool",
};

/** The word a mark speaks with: the chip's word, or the user's own. */
export function quietWord(mark: QuietMark, t: (key: CopyKey) => string): string {
  if (mark.reason === "custom") return mark.custom ?? t("qdCustom");
  return t(QUIET_REASON_KEY[mark.reason]);
}

export function QuietDayBlock({ date }: { date: string }) {
  const t = useT();
  const lang = useLang();
  const marks = useJournal((s) => s.journal.quietDays);
  const dayCount = useJournal((s) => s.journal.sessions.filter((x) => x.date === date).length);
  const [open, setOpen] = useState(false);
  const mark = markOn(marks ?? [], date);
  return (
    <>
      {mark ? (
        <button
          type="button"
          data-testid="quiet-mark-card"
          data-spot="quiet-block"
          className="mb-3 block w-full rounded-2xl border border-border px-3.5 py-3 text-left active:opacity-80"
          onClick={() => setOpen(true)}
        >
          <span className="inline-block rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold">
            {quietWord(mark, t)}
          </span>
          <span className="mt-1.5 block text-sm text-dim">
            {mark.from === mark.to ? fmtDate(mark.from, lang) : fmtRange(mark.from, mark.to, lang)}
          </span>
          {mark.note ? <span className="mt-1 block text-sm leading-relaxed">{mark.note}</span> : null}
        </button>
      ) : (
        <button
          type="button"
          data-testid="quiet-name-action"
          data-spot="quiet-block"
          className={cn("mb-3 min-h-[37px] px-1 text-left text-sm font-semibold text-dim active:opacity-70", dayCount > 0 && "text-xs")}
          onClick={() => setOpen(true)}
        >
          {t("qdNameAction")}
        </button>
      )}
      {open ? <QuietMarkSheet date={date} mark={mark} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function QuietMarkSheet({ date, mark, onClose }: { date: string; mark: QuietMark | null; onClose: () => void }) {
  const t = useT();
  useBackLayer(true, onClose, { name: "quiet-sheet" });
  const saveQuietMark = useJournal((s) => s.saveQuietMark);
  const deleteQuietMark = useJournal((s) => s.deleteQuietMark);
  const showToast = useJournal((s) => s.showToast);
  const [from, setFrom] = useState(mark?.from ?? date);
  const [to, setTo] = useState(mark?.to ?? date);
  const [reason, setReason] = useState<QuietThemeId | "custom">(mark?.reason ?? "life");
  const [custom, setCustom] = useState(mark?.custom ?? "");
  const [note, setNote] = useState(mark?.note ?? "");
  const [askRemove, setAskRemove] = useState(false);
  const valid = from <= to && (reason !== "custom" || custom.trim().length > 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-6 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="ag-panel max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-[1.6rem] border border-accent/35 px-5 py-6"
        data-noswipe
        data-testid="quiet-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="border-b border-accent/25 pb-3 font-display text-2xl leading-tight">{t("qdTitle")} <Hint topic="dias-quietos" compact /></h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-dim">{t("qdFrom")}</span>
            <input type="date" className={cn(fieldClass, "mt-1")} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-dim">{t("qdTo")}</span>
            <input type="date" className={cn(fieldClass, "mt-1")} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUIET_REASONS.map((id) => (
            <button
              key={id}
              type="button"
              data-noswipe
              data-reason={id}
              className={cn(
                "rounded-full border border-border px-3 py-1.5 text-sm transition",
                reason === id && "ag-chip-on border-transparent font-semibold",
              )}
              onClick={() => setReason(id)}
            >
              {t(QUIET_REASON_KEY[id])}
            </button>
          ))}
          <button
            type="button"
            data-noswipe
            data-reason="custom"
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-sm transition",
              reason === "custom" && "ag-chip-on border-transparent font-semibold",
            )}
            onClick={() => setReason("custom")}
          >
            {t("qdCustom")}
          </button>
        </div>
        {reason === "custom" ? (
          <input
            className={cn(fieldClass, "mt-2.5")}
            value={custom}
            maxLength={80}
            placeholder={t("qdCustomPh")}
            onChange={(e) => setCustom(e.target.value)}
          />
        ) : null}
        <input
          className={cn(fieldClass, "mt-2.5")}
          value={note}
          maxLength={160}
          placeholder={t("qdNotePh")}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="min-h-11 px-3 text-sm" onClick={onClose}>
            {t("cancelBtn")}
          </Button>
          <Button
            className="min-h-11 flex-1 px-3 text-sm"
            data-testid="quiet-save"
            disabled={!valid}
            onClick={() => {
              saveQuietMark({
                ...(mark ? { id: mark.id } : {}),
                from,
                to,
                reason,
                ...(reason === "custom" ? { custom: custom.trim() } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
                source: mark?.source ?? "manual",
                ...(mark?.themeText ? { themeText: mark.themeText } : {}),
              });
              showToast(t("qdSavedToast"));
              onClose();
            }}
          >
            {t("qdSave")}
          </Button>
        </div>
        {mark ? (
          <button
            type="button"
            className="mt-3 min-h-[37px] w-full text-sm font-semibold text-[var(--ag-danger)] active:opacity-70"
            onClick={() => setAskRemove(true)}
          >
            {t("qdRemove")}
          </button>
        ) : null}
        <ConfirmDialog
          open={askRemove}
          title={t("qdRemoveQ")}
          confirmLabel={t("qdRemove")}
          cancelLabel={t("cancelBtn")}
          confirmTone="danger"
          onCancel={() => setAskRemove(false)}
          onConfirm={() => {
            if (mark) deleteQuietMark(mark.id);
            setAskRemove(false);
            onClose();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
