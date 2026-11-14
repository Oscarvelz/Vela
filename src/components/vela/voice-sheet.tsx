/* The second voice (2.2) — written blind, signed with her PIN.
   The sheet shows only the shared facts of the moment (day, place, positions):
   never his dials, never his words. Until her voice is saved, his reading
   stays hidden from the writer; afterwards both stand side by side on the
   card, never averaged. Her voice is hers: the PIN gate opens it, and only
   from inside it can it be erased. */
import { useState } from "react";
import { createPortal } from "react-dom";
import { placeLabel, positionLabel } from "@/lib/vela/catalog";
import { fill } from "@/lib/vela/cycle-words";
import { fmtDate } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { ownerPerson, partnerPerson, verifyPin } from "@/lib/vela/people";
import { useJournal } from "@/lib/vela/store";
import type { RatingKey, Session } from "@/lib/vela/types";
import { RATING_KEYS } from "@/lib/vela/types";
import { useBackLayer } from "@/lib/vela/back-stack";
import { Button, ConfirmDialog, RatingIcon, fieldClass } from "./ui";
import { cn } from "@/lib/cn";

const DIAL_LABEL: Record<RatingKey, "intensity" | "connection" | "satisfaction" | "energy"> = {
  intensity: "intensity",
  connection: "connection",
  satisfaction: "satisfaction",
  energy: "energy",
};

export function VoiceSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const style = useJournal((s) => s.journal.settings.ratingStyle);
  const people = useJournal((s) => s.journal.people);
  const savePartnerVoice = useJournal((s) => s.savePartnerVoice);
  const deletePartnerVoice = useJournal((s) => s.deletePartnerVoice);
  const showToast = useJournal((s) => s.showToast);
  const partner = partnerPerson(people);
  const owner = ownerPerson(people);
  const existing = session.partnerVoice;

  const [signed, setSigned] = useState(!partner?.pin);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dials, setDials] = useState<Record<RatingKey, number>>({
    intensity: existing?.intensity ?? 0,
    connection: existing?.connection ?? 0,
    satisfaction: existing?.satisfaction ?? 0,
    energy: existing?.energy ?? 0,
  });
  const [overall, setOverall] = useState(existing?.overall ?? 0);
  const [words, setWords] = useState(existing?.ownWords ?? "");
  const [askErase, setAskErase] = useState(false);

  useBackLayer(true, onClose, { name: "voice-sheet" });
  if (!partner) return null;

  const trySign = async () => {
    setBusy(true);
    const ok = await verifyPin(partner, pin);
    setBusy(false);
    if (ok) {
      setSigned(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const canSave = overall > 0 || RATING_KEYS.some((k) => dials[k] > 0) || words.trim().length > 0;

  const save = () => {
    savePartnerVoice(session.id, {
      ...dials,
      overall,
      ownWords: words.trim(),
      by: partner.id,
    });
    showToast(fill(t("vcSavedToast"), { name: partner.name }));
    onClose();
  };

  const dialRow = (label: string, value: number, set: (n: number) => void) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-dim">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <button
            key={level}
            type="button"
            data-noswipe
            aria-label={`${label} ${level}`}
            className="p-1 active:scale-90"
            onClick={() => set(value === level ? 0 : level)}
          >
            <RatingIcon style={style} className="size-6" active={value >= level} />
          </button>
        ))}
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-6 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="ag-panel max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-[1.6rem] border border-accent/35 px-5 py-6"
        data-noswipe
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="border-b border-accent/25 pb-3 font-display text-2xl leading-tight">
          {fill(t("vcVoiceOf"), { name: partner.name })}
        </h2>
        <p className="mt-3 text-sm text-dim">
          {fmtDate(session.date, lang)}
          {session.place ? ` · ${placeLabel(lang, session.place)}` : ""}
          {session.positions.length ? ` · ${session.positions.map((p) => positionLabel(lang, p)).join(", ")}` : ""}
        </p>

        {!signed ? (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dim">
                {fill(t("cpPinAsk"), { name: partner.name })}
              </span>
              <input
                className={fieldClass}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setPinError(false);
                }}
              />
            </label>
            {pinError ? <p className="text-sm font-semibold text-[var(--ag-accent)]">{t("cpPinWrong")}</p> : null}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                {t("cancelBtn")}
              </Button>
              <Button className="flex-1" disabled={busy || pin.length < 4} onClick={() => void trySign()}>
                {t("acceptBtn")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {!existing ? (
              <p className="text-sm leading-relaxed text-dim">{fill(t("vcBlindBody"), { owner: owner?.name ?? "" })}</p>
            ) : null}
            <div className="space-y-2.5">
              {RATING_KEYS.map((key) =>
                dialRow(t(DIAL_LABEL[key]), dials[key], (n) => setDials((d) => ({ ...d, [key]: n }))),
              )}
              {dialRow(t("overall"), overall, setOverall)}
            </div>
            <textarea
              className={cn(fieldClass, "min-h-20 resize-none")}
              value={words}
              placeholder={t("ownWordsPh")}
              onChange={(e) => setWords(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                {t("cancelBtn")}
              </Button>
              <Button className="flex-1" disabled={!canSave} onClick={save}>
                {t("vcSave")}
              </Button>
            </div>
            {existing ? (
              <Button variant="ghost" className="min-h-10 w-full px-3 text-sm" onClick={() => setAskErase(true)}>
                {t("vcErase")}
              </Button>
            ) : null}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={askErase}
        title={fill(t("vcEraseQ"), { name: partner.name })}
        confirmLabel={t("vcErase")}
        cancelLabel={t("cancelBtn")}
        onCancel={() => setAskErase(false)}
        onConfirm={() => {
          setAskErase(false);
          deletePartnerVoice(session.id);
          showToast(t("vcErasedToast"));
          onClose();
        }}
      />
    </div>,
    document.body,
  );
}
