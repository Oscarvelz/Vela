import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CloudDrizzle, DoorOpen, Feather, Flame, HeartPulse, Plus, Sparkles, UserRound, X } from "lucide-react";
import { NAMED_PLACES, PLACES, POSITIONS, PROBLEMS, knownProblem, placeLabel, positionLabel } from "@/lib/vela/catalog";
import { addDays, fmtDate, fmtDuration, fmtShort, fmtTime, monthTitle, pad, todayStr } from "@/lib/vela/dates";
import { coveringEncounter, weekendOf } from "@/lib/vela/encounters";
import type { Lang } from "@/lib/vela/copy";
import type { CopyKey } from "@/lib/vela/copy";
import { useLang, useT } from "@/lib/vela/i18n";
import { ratingLabel, ratingSentence } from "@/lib/vela/notes";
import { blankDraft, useJournal } from "@/lib/vela/store";
import { trackerForPartner } from "@/lib/vela/cycle-trackers";
import { RATING_KEYS, type Draft, type RatingKey } from "@/lib/vela/types";
import { toneFor, toneVars } from "@/lib/vela/rating-tones";
import "./rating-colors.css";
import { cn } from "@/lib/cn";
import { MonthDays } from "./month-days";
import { SessionPhaseChip } from "./cycle-card";
import { cycleMarks } from "@/lib/vela/cycle";
import { MapAddress } from "./map-address";
import { RemovePartnerDialog } from "./remove-partner-dialog";
import { Button, ConfirmDialog, Field, RatingIcon, fieldClass, saveBurst } from "./ui";

const METHODS = [
  ["pullout", "methodPullout"],
  ["pill", "methodPill"],
  ["condom", "methodCondom"],
  ["iud", "methodIud"],
  ["implant", "methodImplant"],
  ["none", "methodNone"],
] as const;

const PRESETS = [15, 30, 45, 60, 90];

const RATING_HINT = {
  intensity: "intensityHint",
  connection: "connectionHint",
  satisfaction: "satisfactionHint",
  energy: "energyHint",
} as const;

function hintFor(key: RatingKey) {
  return RATING_HINT[key];
}

export function SessionForm({
  initial,
  editing = false,
  onSave,
  onSaveAll,
  onClose,
}: {
  initial?: Draft;
  editing?: boolean;
  onSave: (draft: Draft) => void;
  onSaveAll?: (drafts: Draft[]) => void;
  onClose?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const partners = useJournal((s) => s.journal.partners);
  const defaultPartner = useJournal((s) => s.journal.settings.defaultPartner);
  const setDefaultPartner = useJournal((s) => s.setDefaultPartner);
  const addPartner = useJournal((s) => s.addPartner);
  const removePartner = useJournal((s) => s.removePartner);
  const customPlaces = useJournal((s) => s.journal.settings.customPlaces);
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const customPositions = useJournal((s) => s.journal.settings.customPositions);
  const weekStart = useJournal((s) => s.journal.settings.weekStart);
  const ratingStyle = useJournal((s) => s.journal.settings.ratingStyle);
  const activeRef = useRef(0);
  const ownRef = useRef<Set<number>>(new Set([0]));
  const [active, setActive] = useState(0);
  const [slots, setSlots] = useState<Draft[]>(() => {
    const base = initial ?? blankDraft();
    if (!initial && defaultPartner && partners.includes(defaultPartner)) {
      return [{ ...base, partnerName: defaultPartner, newPartner: "" }];
    }
    return [base];
  });
  const draft = slots[Math.min(active, Math.max(slots.length - 1, 0))] ?? blankDraft();
  // The session's phase (chip and date picker marks) comes from its partner's tracker, else the user's own.
  const draftPartner = draft.newPartner.trim() || draft.partnerName || "";
  const cycle = trackerForPartner(cycles, draftPartner);
  const [openDate, setOpenDate] = useState(false);
  const [openTime, setOpenTime] = useState(false);
  const [openRate, setOpenRate] = useState<RatingKey | null>(null);
  const [ratePulse, setRatePulse] = useState(0);
  const [pinOpen, setPinOpen] = useState(false);
  const [dropPartner, setDropPartner] = useState<string | null>(null);
  const date = useMemo(() => {
    const parsed = draft.date.split("-").map(Number);
    return { y: parsed[0], m: (parsed[1] || 1) - 1 };
  }, [draft.date]);
  const [view, setView] = useState({ y: date.y, m: date.m });
  const places = [...PLACES, ...NAMED_PLACES.map((place) => place.name), ...customPlaces].filter(
    (place, index, all) => all.indexOf(place) === index,
  );
  const positions = [...POSITIONS, ...customPositions];

  const patch = useCallback((partial: Partial<Draft>) => {
    setSlots((current) => {
      if (current.length === 0) return current;
      const index = Math.min(activeRef.current, current.length - 1);
      const head = current[index];
      const start = partial.encounterStart ?? head.encounterStart;
      const end = partial.encounterEnd ?? head.encounterEnd;
      const sameNight = (start || partial.date || head.date) === (end || partial.date || head.date);
      const nextPartial: Partial<Draft> = { ...partial };
      if (partial.positions) nextPartial.positions = partial.positions.slice();
      if (partial.problems) nextPartial.problems = partial.problems.slice();
      if (partial.encounterProblems) nextPartial.encounterProblems = partial.encounterProblems.slice();
      return current.map((slot, i) => {
        if (i === index || (index === 0 && !ownRef.current.has(i))) return { ...slot, ...nextPartial };
        const shared: Partial<Draft> = {};
        if (partial.partnerName !== undefined) shared.partnerName = partial.partnerName;
        if (partial.newPartner !== undefined) shared.newPartner = partial.newPartner;
        if (partial.encounterId !== undefined) shared.encounterId = partial.encounterId;
        if (partial.encounterTitle !== undefined) shared.encounterTitle = partial.encounterTitle;
        if (partial.encounterStart !== undefined) shared.encounterStart = partial.encounterStart;
        if (partial.encounterEnd !== undefined) shared.encounterEnd = partial.encounterEnd;
        if (partial.encounterProblems !== undefined) shared.encounterProblems = partial.encounterProblems.slice();
        if (sameNight && partial.date !== undefined) shared.date = partial.date;
        return Object.keys(shared).length ? { ...slot, ...shared } : slot;
      });
    });
  }, []);

  useEffect(() => {
    if (editing || !defaultPartner) return;
    if (!useJournal.getState().journal.partners.includes(defaultPartner)) return;
    setSlots((current) =>
      current.map((slot) =>
        !slot.partnerName && !slot.newPartner ? { ...slot, partnerName: defaultPartner } : slot,
      ),
    );
  }, [defaultPartner, editing]);

  function chooseCount(next: number) {
    const total = Math.min(6, Math.max(1, next));
    setSlots((current) => {
      const source = current[0];
      const kept = current.slice(0, total);
      while (kept.length < total) {
        kept.push({
          ...source,
          positions: source.positions.slice(),
          problems: source.problems.slice(),
          contraception: source.contraception.slice(),
          encounterProblems: source.encounterProblems.slice(),
        });
      }
      return kept;
    });
    ownRef.current = new Set([...ownRef.current].filter((index) => index < total));
    ownRef.current.add(0);
    setActive((current) => {
      const clamped = Math.min(current, total - 1);
      activeRef.current = clamped;
      return clamped;
    });
  }

  function chooseSession(index: number) {
    if (index > 0) ownRef.current.add(index);
    activeRef.current = index;
    setActive(index);
  }

  function shiftPicker(delta: number) {
    setView((current) => {
      let m = current.m + delta;
      let y = current.y;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      if (m > 11) {
        m = 0;
        y += 1;
      }
      return { y, m };
    });
  }

  return (
    <div className={cn("space-y-5", !editing && slots.length > 1 && "pb-16")} data-noswipe>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("date")}>
          <button
            type="button"
            className={cn(fieldClass, "flex items-center justify-between text-left")}
            onClick={() => {
              setOpenDate((open) => !open);
              setOpenTime(false);
            }}
            aria-label={t("pickDateAria")}
          >
            <span>{fmtDate(draft.date, lang).replace(/,?\s*\d{4}/, "")}</span>
          </button>
        </Field>
        <Field label={t("time")}>
          <button
            type="button"
            className={cn(fieldClass, "flex items-center text-left")}
            aria-label={t("time")}
            aria-expanded={openTime}
            onClick={() => {
              setOpenTime((open) => !open);
              setOpenDate(false);
            }}
          >
            <span className="whitespace-nowrap tabular-nums">{fmtTime(draft.time, lang)}</span>
          </button>
        </Field>
      </div>
      <SessionPhaseChip date={draft.date} partner={draftPartner} />
      {openDate ? (
        <div className="rounded-card border border-border bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="grid size-9 place-items-center" onClick={() => shiftPicker(-1)} aria-label={t("prevMonth")}>
              <ChevronLeft className="size-5" />
            </button>
            <p className="font-display text-lg">{monthTitle(view.y, view.m, lang)}</p>
            <button type="button" className="grid size-9 place-items-center" onClick={() => shiftPicker(1)} aria-label={t("nextMonth")}>
              <ChevronRight className="size-5" />
            </button>
          </div>
          <MonthDays
            year={view.y}
            month={view.m}
            weekStart={weekStart}
            lang={lang}
            selected={draft.date}
            marks={cycle?.enabled ? cycleMarks(cycle, `${view.y}-${pad(view.m + 1)}-01`, `${view.y}-${pad(view.m + 1)}-31`, todayStr()) : undefined}
            marker={ratingStyle}
            onPick={(ds) => {
              patch({ date: ds });
              setOpenDate(false);
            }}
          />
          <button type="button" className="mt-2 text-sm font-semibold text-accent" onClick={() => patch({ date: todayStr() })}>
            {t("todayBtn")}
          </button>
        </div>
      ) : null}
      {openTime ? (
        <ClockPicker value={draft.time} onChange={(time) => patch({ time })} onDone={() => setOpenTime(false)} />
      ) : null}

      <div>
        <div className="mb-2 flex items-center gap-2">
          <p className="text-sm font-semibold">{t("withWhom")}</p>
          <button
            type="button"
            aria-label={t("pinPartnerAria")}
            aria-expanded={pinOpen}
            className={cn(
              "grid size-7 place-items-center rounded-full border",
              defaultPartner ? "border-accent text-accent" : "border-border text-dim",
            )}
            onClick={() => setPinOpen((open) => !open)}
          >
            <UserRound className="size-3.5" />
          </button>
        </div>
        {pinOpen ? (
          <div className="mb-3">
            <p className="mb-2 text-sm text-dim">{t("defaultPartner")}</p>
            <div className="flex flex-wrap gap-2">
              <Chip small on={defaultPartner === ""} onClick={() => setDefaultPartner("")}>
                {t("defaultNone")}
              </Chip>
              {partners.map((partner) => (
                <span key={partner} className="inline-flex items-center gap-1">
                  <Chip
                    small
                    on={defaultPartner === partner}
                    onClick={() => {
                      setDefaultPartner(partner);
                      if (!editing) patch({ partnerName: partner, newPartner: "" });
                    }}
                  >
                    {partner}
                  </Chip>
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-full text-dim"
                    aria-label={`${t("removePartnerAria")} ${partner}`}
                    onClick={() => setDropPartner(partner)}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {draft.newPartner.trim() && !partners.includes(draft.newPartner.trim()) ? (
                <Chip
                  small
                  on={false}
                  onClick={() => {
                    const name = draft.newPartner.trim();
                    addPartner(name);
                    setDefaultPartner(name);
                    patch({ partnerName: name, newPartner: "" });
                  }}
                >
                  {draft.newPartner.trim()}
                </Chip>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-dim">{t("defaultPartnerHint")}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Chip on={draft.partnerName === "" && !draft.newPartner} onClick={() => patch({ partnerName: "", newPartner: "" })}>
            {t("solo")}
          </Chip>
          {partners.map((partner) => (
            <span
              key={partner}
              className={cn(
                "inline-flex items-center rounded-full border",
                draft.partnerName === partner && !draft.newPartner ? "ag-chip-on" : "ag-pill border-border text-fg",
              )}
            >
              <button
                type="button"
                className="min-h-11 pl-4 pr-1 text-sm font-semibold"
                onClick={() => patch({ partnerName: partner, newPartner: "" })}
              >
                {partner}
              </button>
              <button
                type="button"
                className="grid size-8 place-items-center pr-1.5 text-dim"
                aria-label={`${t("removePartnerAria")} ${partner}`}
                onClick={() => setDropPartner(partner)}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
        <input
          className={cn(fieldClass, "mt-3")}
          value={draft.newPartner}
          placeholder={t("newPartnerPh")}
          aria-label={t("addNewPartnerAria")}
          onChange={(event) => patch({ newPartner: event.target.value, partnerName: "" })}
        />
        <RemovePartnerDialog
          name={dropPartner}
          onCancel={() => setDropPartner(null)}
          onConfirm={() => {
            if (!dropPartner) return;
            removePartner(dropPartner);
            if (draft.partnerName === dropPartner) patch({ partnerName: "", newPartner: "" });
            setDropPartner(null);
          }}
        />
      </div>

      <EncounterField
        draft={draft}
        editing={editing}
        count={editing ? 1 : slots.length}
        active={active}
        onCount={editing ? undefined : chooseCount}
        onPick={chooseSession}
        onChange={patch}
      />

      <Fold
        title={t("place")}
        summary={
          draft.place === "Other"
            ? draft.customPlace
            : draft.place === "Map"
              ? draft.customPlace || t("mapAddress")
              : placeLabel(lang, draft.place)
        }
      >
        <div className="flex flex-wrap gap-2">
          {places.map((place) => (
            <Chip key={place} small on={draft.place === place} onClick={() => patch({ place, customPlace: place === "Other" ? draft.customPlace : "" })}>
              {placeLabel(lang, place)}
            </Chip>
          ))}
          <Chip small on={draft.place === "Map"} onClick={() => patch({ place: "Map" })}>
            {t("mapAddress")}
          </Chip>
        </div>
        {draft.place === "Map" ? (
          <MapAddress address={draft.customPlace} onAddress={(customPlace) => patch({ customPlace })} />
        ) : null}
        {draft.place === "Other" && draft.customPlace ? (
          <p className="mt-2 text-sm text-fg/70">{draft.customPlace}</p>
        ) : null}
        <OwnLine
          placeholder={t("customPlacePh")}
          onAdd={(name) => {
            const known = places.find((place) => place.toLowerCase() === name.toLowerCase() || placeLabel(lang, place).toLowerCase() === name.toLowerCase());
            if (known) patch({ place: known, customPlace: "" });
            else patch({ place: "Other", customPlace: name });
          }}
        />
      </Fold>

      <Fold
        title={t("contraception")}
        summary={draft.contraception.map((id) => methodName(t, id)).join(" · ")}
      >
        <div className="flex flex-wrap gap-2">
          {METHODS.map(([id, label]) => {
            const on = draft.contraception.includes(id);
            return (
              <Chip
                key={id}
                small
                on={on}
                onClick={() =>
                  patch({
                    contraception: on
                      ? draft.contraception.filter((item) => item !== id)
                      : [...draft.contraception, id],
                  })
                }
              >
                {t(label)}
              </Chip>
            );
          })}
          {draft.contraception
            .filter((id) => !METHODS.some((row) => row[0] === id))
            .map((id) => (
              <Chip
                key={id}
                small
                on
                onClick={() => patch({ contraception: draft.contraception.filter((item) => item !== id) })}
              >
                {id}
              </Chip>
            ))}
        </div>
        <OwnLine
          placeholder={t("problemPh")}
          onAdd={(name) => {
            const known = METHODS.find((row) => row[0] === name.toLowerCase() || t(row[1]).toLowerCase() === name.toLowerCase());
            const id = known ? known[0] : name;
            if (!draft.contraception.includes(id)) patch({ contraception: [...draft.contraception, id] });
          }}
        />
      </Fold>

      <ProblemsPicker
        scope="session"
        selected={draft.problems}
        onChange={(problems) => patch({ problems })}
      />

      <div>
        <p className="mb-2 text-sm font-semibold">
          {t("duration")} — {fmtDuration(draft.durationMins)}
        </p>
        <input
          type="range"
          className="ag-range"
          min={5}
          max={240}
          step={5}
          value={draft.durationMins}
          aria-label={t("duration")}
          style={{ ["--fill" as string]: `${((draft.durationMins - 5) / 235) * 100}%` }}
          onChange={(event) => patch({ durationMins: Number(event.target.value) })}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((mins) => (
            <Chip key={mins} small on={draft.durationMins === mins} onClick={() => patch({ durationMins: mins })}>
              {fmtDuration(mins, true)}
            </Chip>
          ))}
        </div>
      </div>

      <Fold title={t("positions")} summary={draft.positions.map((position) => positionLabel(lang, position)).join(" · ")}>
        <div className="flex flex-wrap gap-2">
          {positions.map((position) => {
            const on = draft.positions.includes(position);
            return (
              <Chip
                key={position}
                small
                on={on}
                onClick={() =>
                  patch({
                    positions: on
                      ? draft.positions.filter((item) => item !== position)
                      : [...draft.positions, position],
                  })
                }
              >
                {positionLabel(lang, position)}
              </Chip>
            );
          })}
          {draft.positions
            .filter((position) => !positions.includes(position))
            .map((position) => (
              <Chip
                key={position}
                small
                on
                onClick={() => patch({ positions: draft.positions.filter((item) => item !== position) })}
              >
                {position}
              </Chip>
            ))}
        </div>
        <OwnLine
          placeholder={t("problemPh")}
          onAdd={(name) => {
            const known = positions.find(
              (position) => position.toLowerCase() === name.toLowerCase() || positionLabel(lang, position).toLowerCase() === name.toLowerCase(),
            );
            const id = known ?? name;
            if (!draft.positions.includes(id)) patch({ positions: [...draft.positions, id] });
          }}
        />
      </Fold>

      <div>
        <p className="text-sm font-semibold">{t("rateTitle")}</p>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-dim">{t("rateHint")}</p>
        <div className="space-y-3">
          {RATING_KEYS.map((key) => (
            <RatingBlock
              key={key}
              ratingKey={key}
              open={openRate === key}
              value={draft[key]}
              onToggle={() => setOpenRate((current) => (current === key ? null : key))}
              onPick={(level) => patch({ [key]: level })}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">
          {t("overall")} — {draft.overall} {t("of5")}
        </p>
        <div className="flex gap-2" role="radiogroup" aria-label={t("overallRatingAria")}>
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={draft.overall >= level}
              onClick={() => {
                patch({ overall: level });
                setRatePulse(0);
                requestAnimationFrame(() => setRatePulse(level));
              }}
              onAnimationEnd={() => setRatePulse((current) => (current === level ? 0 : current))}
              className={cn(
                "grid size-12 place-items-center rounded-xl border transition-colors duration-200",
                draft.overall >= level ? "ag-rate-on border-accent" : "border-border",
                ratePulse === level && "ag-rate-pulse",
              )}
            >
              <RatingIcon style={ratingStyle} className="size-5" active={draft.overall >= level} />
            </button>
          ))}
        </div>
      </div>

      {draft.prevNote && editing ? (
        <p className="text-sm text-dim">
          {t("previousNote")}: “{draft.prevNote}”
        </p>
      ) : null}

      <Field label={t("ownWords")}>
        <textarea
          className={cn(fieldClass, "min-h-24 resize-y")}
          value={draft.ownWords}
          placeholder={t("ownWordsPh")}
          onChange={(event) => patch({ ownWords: event.target.value })}
        />
      </Field>

      <div className="flex gap-2">
        <Button
          variant="save"
          className="flex-1 rounded-control text-base"
          data-testid="save-moment"
          onClick={(event) => {
            saveBurst(event.currentTarget);
            if (!editing && slots.length > 1 && onSaveAll) onSaveAll(slots);
            else onSave(draft);
          }}
        >
          <span className="ag-save-ico" aria-hidden>
            {editing ? <Check className="size-[18px]" strokeWidth={2.6} /> : <Sparkles className="size-[18px]" strokeWidth={2.2} />}
          </span>
          {editing ? t("saveChanges") : slots.length > 1 ? t("saveThese") : t("saveMoment")}
        </Button>
        {onClose ? (
          <Button variant="ghost" onClick={onClose}>
            {t("closeEdit")}
          </Button>
        ) : null}
      </div>
      {!editing && slots.length > 1 ? (
        <div
          className="fixed inset-x-0 z-30 flex justify-center px-4"
          style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2 rounded-full border border-border bg-surface px-2 py-2" data-noswipe>
            {slots.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-pressed={active === index}
                aria-label={`${t("sessionThatDay")} ${index + 1}`}
                className={cn(
                  "grid size-11 place-items-center rounded-full border text-sm font-semibold",
                  active === index ? "ag-chip-on text-accent" : "border-border text-dim",
                )}
                onClick={() => chooseSession(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClockPicker({
  value,
  onChange,
  onDone,
}: {
  value: string;
  onChange: (time: string) => void;
  onDone: () => void;
}) {
  const [face, setFace] = useState<"hour" | "minute">("hour");
  const [hourText, minuteText] = (value || "21:00").split(":");
  const hour24 = Number(hourText) || 0;
  const minute = Number(minuteText) || 0;
  const pm = hour24 >= 12;
  const hour12 = hour24 % 12 || 12;
  const marks = face === "hour" ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  function commit(hour: number, min: number) {
    onChange(`${pad(((hour % 24) + 24) % 24)}:${pad(((min % 60) + 60) % 60)}`);
  }

  function pickHour(hourOnFace: number) {
    const base = hourOnFace % 12;
    commit(pm ? base + 12 : base, minute);
    setFace("minute");
  }

  function pickPeriod(nextPm: boolean) {
    commit(nextPm ? (hour24 % 12) + 12 : hour24 % 12, minute);
  }

  return (
    <div className="rounded-card border border-border bg-surface-2 px-3 py-4">
      <div className="mb-3 flex items-center justify-center gap-2">
        <button
          type="button"
          className={cn("min-w-12 rounded-control px-3 py-1 text-2xl tabular-nums", face === "hour" ? "bg-accent text-on-accent" : "text-dim")}
          onClick={() => setFace("hour")}
        >
          {pad(hour24)}
        </button>
        <span className="text-2xl text-dim">:</span>
        <button
          type="button"
          className={cn("min-w-12 rounded-control px-3 py-1 text-2xl tabular-nums", face === "minute" ? "bg-accent text-on-accent" : "text-dim")}
          onClick={() => setFace("minute")}
        >
          {pad(minute)}
        </button>
      </div>
      <div className="relative mx-auto size-[248px]">
        <div className="absolute inset-8 rounded-full border border-border" />
        {marks.map((mark, index) => {
          const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
          const selected = face === "hour" ? mark === hour12 : mark === minute;
          return (
            <button
              key={mark}
              type="button"
              className={cn(
                "absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-sm font-semibold tabular-nums",
                selected ? "bg-accent text-on-accent" : "text-fg",
              )}
              style={{ left: 124 + Math.cos(angle) * 96, top: 124 + Math.sin(angle) * 96 }}
              onClick={() => {
                if (face === "hour") {
                  pickHour(mark);
                  return;
                }
                commit(hour24, mark);
                onDone();
              }}
            >
              {face === "minute" ? pad(mark) : mark}
            </button>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={cn("min-h-10 rounded-full border text-sm font-semibold", !pm ? "border-accent text-accent" : "border-border text-dim")}
          onClick={() => pickPeriod(false)}
        >
          AM
        </button>
        <button
          type="button"
          className={cn("min-h-10 rounded-full border text-sm font-semibold", pm ? "border-accent text-accent" : "border-border text-dim")}
          onClick={() => pickPeriod(true)}
        >
          PM
        </button>
      </div>
    </div>
  );
}

function EncounterField({
  draft,
  editing,
  count,
  active,
  onCount,
  onPick,
  onChange,
}: {
  draft: Draft;
  editing?: boolean;
  count: number;
  active: number;
  onCount?: (count: number) => void;
  onPick: (index: number) => void;
  onChange: (partial: Partial<Draft>) => void;
}) {
  const t = useT();
  const lang = useLang();
  const encounters = useJournal((s) => s.journal.encounters);
  const sessions = useJournal((s) => s.journal.sessions);
  const composeId = useJournal((s) => s.composeEncounterId);
  const clearCompose = useJournal((s) => s.clearCompose);
  const lock = useRef(Boolean(editing));
  const start = draft.encounterStart || draft.date;
  const end = draft.encounterEnd || draft.date;
  const [spanMode, setSpanMode] = useState<"night" | "more">(start !== end ? "more" : "night");
  // Only an encounter with this same partner (or solo with solo) can take this session.
  const cover = coveringEncounter(encounters, draft.date, draft.newPartner.trim() || draft.partnerName || "");

  useEffect(() => {
    if (!composeId || editing) return;
    const encounter = encounters.find((item) => item.id === composeId);
    clearCompose();
    if (!encounter) return;
    lock.current = true;
    setSpanMode(encounter.startDate === encounter.endDate ? "night" : "more");
    onChange({
      encounterId: encounter.id,
      encounterTitle: encounter.title,
      encounterStart: encounter.startDate,
      encounterEnd: encounter.endDate,
      encounterProblems: encounter.problems ?? [],
      date:
        encounter.startDate <= draft.date && draft.date <= encounter.endDate ? draft.date : encounter.endDate,
    });
  }, [composeId, editing, encounters, clearCompose, draft.date, onChange]);

  useEffect(() => {
    if (editing || lock.current) return;
    if (cover) {
      if (
        draft.encounterId === cover.id &&
        draft.encounterStart === cover.startDate &&
        draft.encounterEnd === cover.endDate &&
        draft.encounterTitle === cover.title
      ) {
        return;
      }
      setSpanMode(cover.startDate === cover.endDate ? "night" : "more");
      onChange({
        encounterId: cover.id,
        encounterTitle: cover.title,
        encounterStart: cover.startDate,
        encounterEnd: cover.endDate,
        encounterProblems: draft.encounterProblems.length ? draft.encounterProblems : (cover.problems ?? []),
      });
      return;
    }
    if (draft.encounterId === "new" && draft.encounterStart === draft.date && draft.encounterEnd === draft.date) return;
    setSpanMode("night");
    onChange({ encounterId: "new", encounterStart: draft.date, encounterEnd: draft.date, encounterTitle: "" });
  }, [cover, draft.date, draft.encounterId, draft.encounterStart, draft.encounterEnd, draft.encounterTitle, editing, onChange]);

  function applySpan(nextStart: string, nextEnd: string) {
    const from = nextStart <= nextEnd ? nextStart : nextEnd;
    const to = nextStart <= nextEnd ? nextEnd : nextStart;
    lock.current = true;
    onChange({
      encounterId: draft.encounterId || "new",
      encounterStart: from,
      encounterEnd: to,
    });
  }

  function chooseNight() {
    const outside = sessions.some(
      (session) => session.encounterId === draft.encounterId && session.date !== draft.date,
    );
    if (draft.encounterId !== "new" && outside) return;
    lock.current = false;
    setSpanMode("night");
    if (cover && cover.startDate === cover.endDate) {
      onChange({
        encounterId: cover.id,
        encounterTitle: cover.title,
        encounterStart: cover.startDate,
        encounterEnd: cover.endDate,
      });
      return;
    }
    onChange({
      encounterId: draft.encounterId && draft.encounterId !== "new" ? draft.encounterId : "new",
      encounterStart: draft.date,
      encounterEnd: draft.date,
    });
  }

  function chooseMore() {
    lock.current = true;
    setSpanMode("more");
    if (!draft.encounterId) onChange({ encounterId: "new", encounterStart: draft.date, encounterEnd: draft.date });
  }

  const joined = draft.encounterId !== "" && draft.encounterId !== "new";
  const nightCount = sessions.filter((session) => session.date === draft.date && session.encounterId === draft.encounterId).length;
  const encounterCount = sessions.filter((session) => session.encounterId === draft.encounterId).length;
  const base = spanMode === "night" ? nightCount : encounterCount;
  const from = base + (editing ? 0 : 1);
  const to = base + (editing ? 0 : count);

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{t("encounter")}</p>
      <div className="flex gap-2">
        <Chip on={spanMode === "night"} onClick={chooseNight} className="flex-1">
          {t("thisNight")}
        </Chip>
        <Chip on={spanMode === "more"} onClick={chooseMore} className="flex-1">
          {t("moreDays")}
        </Chip>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-dim">{spanMode === "night" ? t("nightSessionsHint") : t("extendHint")}</p>
      {onCount ? (
        <div className="mt-3">
          <p className="mb-2 text-sm font-semibold">{t("howMany")}</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} small on={count === n} onClick={() => onCount(n)}>
                {n}
              </Chip>
            ))}
          </div>
          {count > 1 ? null : <p className="mt-2 text-sm leading-relaxed text-dim">{t("howManyHint")}</p>}
        </div>
      ) : null}
      {draft.encounterId ? (
        <p className="mt-2 text-sm font-semibold">
          {count > 1
            ? `${t("willBeSessions")} ${from}–${to} ${spanMode === "night" ? t("ofThisNight") : t("ofThisEncounter")}`
            : `${t("willBeSession")} ${Math.max(from, 1)} ${spanMode === "night" ? t("ofThisNight") : t("ofThisEncounter")}`}
        </p>
      ) : null}
      <input
        className={cn(fieldClass, "mt-3")}
        value={draft.encounterTitle}
        placeholder={t("encounterNamePh")}
        aria-label={t("encounter")}
        onChange={(event) => {
          lock.current = true;
          onChange({ encounterTitle: event.target.value, encounterId: draft.encounterId || "new" });
        }}
      />
      {spanMode === "more" ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Chip
              on={start === draft.date && end === addDays(draft.date, 1)}
              onClick={() => applySpan(draft.date, addDays(draft.date, 1))}
            >
              {t("throughTomorrow")}
            </Chip>
            <Chip
              on={start === weekendOf(draft.date).start && end === weekendOf(draft.date).end}
              onClick={() => {
                const span = weekendOf(draft.date);
                applySpan(span.start, span.end);
              }}
            >
              {t("thisWeekend")}
            </Chip>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded-control border border-border px-1 py-2">
              <button type="button" className="grid size-9 place-items-center text-lg" onClick={() => applySpan(addDays(start, -1), end)} aria-label={t("encounterFrom")}>
                ‹
              </button>
              <span className="text-center">
                <span className="block text-[10px] font-semibold text-dim">{t("encounterFrom")}</span>
                <span className="text-sm font-semibold">{fmtShort(start, lang)}</span>
              </span>
              <button type="button" className="grid size-9 place-items-center text-lg" onClick={() => applySpan(addDays(start, 1), end)} aria-label={t("encounterFrom")}>
                ›
              </button>
            </div>
            <div className="flex items-center justify-between rounded-control border border-border px-1 py-2">
              <button type="button" className="grid size-9 place-items-center text-lg" onClick={() => applySpan(start, addDays(end, -1))} aria-label={t("encounterThrough")}>
                ‹
              </button>
              <span className="text-center">
                <span className="block text-[10px] font-semibold text-dim">{t("encounterThrough")}</span>
                <span className="text-sm font-semibold">{fmtShort(end, lang)}</span>
              </span>
              <button type="button" className="grid size-9 place-items-center text-lg" onClick={() => applySpan(start, addDays(end, 1))} aria-label={t("encounterThrough")}>
                ›
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {cover && !joined ? (
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-accent"
          onClick={() => {
            lock.current = false;
            onChange({
              encounterId: cover.id,
              encounterTitle: cover.title,
              encounterStart: cover.startDate,
              encounterEnd: cover.endDate,
              encounterProblems: draft.encounterProblems.length ? draft.encounterProblems : (cover.problems ?? []),
            });
          }}
        >
          {t("thisNight")}
        </button>
      ) : null}
      {joined ? (
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-dim"
          onClick={() => {
            lock.current = true;
            setSpanMode("night");
            onChange({ encounterId: "new", encounterTitle: "", encounterStart: draft.date, encounterEnd: draft.date, encounterProblems: [] });
          }}
        >
          {t("differentEncounter")}
        </button>
      ) : null}
      <div className="mt-4">
        <ProblemsPicker
          scope="encounter"
          selected={draft.encounterProblems}
          onChange={(encounterProblems) => {
            lock.current = true;
            onChange({ encounterProblems, encounterId: draft.encounterId || "new" });
          }}
        />
      </div>
    </div>
  );
}

const PROBLEM_GROUPS: { id: string; label: CopyKey; ids: string[] }[] = [
  { id: "body", label: "problemGroupBody", ids: ["erection", "climax", "timing", "pain", "dryness", "bleeding", "irritation", "period"] },
  { id: "mood", label: "problemGroupMood", ids: ["fatigue", "connection", "mood", "stress", "desire", "anxiety"] },
  { id: "situation", label: "problemGroupSituation", ids: ["distraction", "privacy", "alcohol", "medication", "interruption"] },
];

const PROBLEM_ICONS: Record<string, typeof HeartPulse> = { body: HeartPulse, mood: CloudDrizzle, situation: DoorOpen, yours: Feather };

function ProblemsPicker({
  scope,
  selected,
  onChange,
}: {
  scope: "session" | "encounter";
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useT();
  const custom = useJournal((s) => s.journal.settings.customProblems);
  const add = useJournal((s) => s.addCustom);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const uid = useId();
  const yours = custom.filter((item) => !PROBLEMS.some((row) => row[0] === item));
  const encounter = scope === "encounter";
  const knownIds = PROBLEM_GROUPS.flatMap((group) => group.ids);
  // Anything chosen that no group lists (an older custom name) still shows under Yours.
  const strays = selected.filter((id) => !knownIds.includes(id) && !yours.includes(id));

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function saveOwn() {
    const name = text.trim();
    if (!name) return;
    const known = PROBLEMS.find(
      (item) => item[0] === name.toLowerCase() || t(item[1]).toLowerCase() === name.toLowerCase(),
    );
    const id = known ? known[0] : name;
    if (!known) add("problems", name);
    if (!selected.includes(id)) onChange([...selected, id]);
    setText("");
    setOpen((current) => ({ ...current, yours: true }));
  }

  const groups = [
    ...PROBLEM_GROUPS,
    { id: "yours", label: "problemGroupYours" as CopyKey, ids: [...yours, ...strays] },
  ];

  return (
    <section className="vp" data-scope={scope} aria-labelledby={`${uid}-title`}>
      <span className="vp-glow" aria-hidden="true" />
      <header className="vp-head">
        <div className="vp-head-top">
          <p className="vp-eyebrow">
            <span className="vp-eyebrow-dot" aria-hidden="true" />
            {encounter ? t("problemsEyebrowEncounter") : t("problemsEyebrowSession")}
          </p>
          {selected.length > 0 ? (
            <span className="vp-count" key={selected.length}>
              <span className="tabular-nums">{selected.length}</span> {selected.length === 1 ? t("problemsChosen1") : t("problemsChosen")}
            </span>
          ) : null}
        </div>
        <h3 id={`${uid}-title`} className="vp-title font-display">
          {t("problemsTitle")}
          <span className="sr-only"> — {t("problems")}</span>
        </h3>
        <p className="vp-sub">{encounter ? t("problemsSubEncounter") : t("problemsSubSession")}</p>
      </header>
      <div className="vp-list">
        {groups.map((group) => {
          const picked = group.ids.filter((id) => selected.includes(id));
          const shown = !!open[group.id];
          const Icon = PROBLEM_ICONS[group.id] ?? Feather;
          const panelId = `${uid}-${group.id}`;
          const hint =
            group.id === "yours" && group.ids.length === 0
              ? t("problemYoursEmpty")
              : group.ids.slice(0, 2).map((id) => problemName(t, id)).join(", ") + (group.ids.length > 2 ? "…" : "");
          return (
            <div key={group.id} className="vp-row" data-open={shown} data-picked={picked.length > 0}>
              <button
                type="button"
                className="vp-row-btn"
                aria-expanded={shown}
                aria-controls={panelId}
                onClick={() => setOpen((current) => ({ ...current, [group.id]: !current[group.id] }))}
              >
                <span className="vp-ring" aria-hidden="true">
                  <Icon className="size-[17px]" strokeWidth={1.8} />
                  {picked.length > 0 ? <span className="vp-ring-badge">{picked.length}</span> : null}
                </span>
                <span className="vp-row-text">
                  <span className="vp-row-label">{t(group.label)}</span>
                  {picked.length > 0 ? (
                    <span className="vp-row-picked">
                      {picked.slice(0, 2).map((id) => (
                        <span key={id} className="vp-mini">{problemName(t, id)}</span>
                      ))}
                      {picked.length > 2 ? <span className="vp-mini vp-mini-more">+{picked.length - 2}</span> : null}
                    </span>
                  ) : (
                    <span className="vp-row-hint">{hint}</span>
                  )}
                </span>
                <span className="vp-chev" aria-hidden="true">
                  <ChevronDown className="size-4" />
                </span>
              </button>
              <div className="vp-fold" data-open={shown} id={panelId} role="region" aria-label={t(group.label)}>
                <div className="vp-fold-in">
                  <div className="vp-opts">
                    {group.ids.map((id) => {
                      const on = selected.includes(id);
                      return (
                        <Chip key={id} small on={on} onClick={() => toggle(id)} className="vp-opt">
                          {on ? <Check className="vp-opt-check" aria-hidden="true" strokeWidth={2.6} /> : null}
                          {problemName(t, id)}
                        </Chip>
                      );
                    })}
                    {group.id === "yours" ? (
                      <div className="vp-add">
                        <Plus className="size-4 shrink-0 vp-add-ico" aria-hidden="true" />
                        <input
                          value={text}
                          placeholder={t("problemPh")}
                          aria-label={t("problemPh")}
                          onChange={(event) => setText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveOwn();
                            }
                          }}
                        />
                        <button type="button" className="vp-add-save" onClick={saveOwn} disabled={!text.trim()}>
                          {t("saveProblem")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function problemName(t: (key: CopyKey) => string, id: string) {
  const known = knownProblem(id);
  return known ? t(known) : id;
}

function methodName(t: (key: CopyKey) => string, id: string) {
  const known = METHODS.find((row) => row[0] === id);
  return known ? t(known[1]) : id;
}

function Fold({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-fg/18 bg-bg/50">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="shrink-0 font-semibold">{title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg/60">{summary}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-fg/70 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </div>
  );
}

function OwnLine({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  function commit() {
    const name = text.trim();
    if (!name) return;
    onAdd(name);
    setText("");
  }
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-fg/60">{t("ownHere")}</p>
      <div className="flex gap-2">
        <input
          className={fieldClass}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
        />
        <Button className="shrink-0 px-4" onClick={commit}>
          {t("saveProblem")}
        </Button>
      </div>
    </div>
  );
}

function Chip({
  on,
  children,
  onClick,
  className,
  small,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border font-semibold",
        small ? "min-h-[37px] px-[0.85rem] text-[0.8rem]" : "min-h-11 px-4 text-sm",
        on ? "ag-chip-on" : "ag-pill border-border text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

function scrollParent(node: HTMLElement) {
  let el = node.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  return null;
}

function RatingBlock({
  ratingKey,
  open,
  value,
  onToggle,
  onPick,
}: {
  ratingKey: RatingKey;
  open: boolean;
  value: number;
  onToggle: () => void;
  onPick: (level: number) => void;
}) {
  const t = useT();
  const lang = useLang();
  const head = useRef<HTMLButtonElement>(null);
  const anchor = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (anchor.current == null || !head.current) return;
    const delta = head.current.getBoundingClientRect().top - anchor.current;
    anchor.current = null;
    if (Math.abs(delta) < 1) return;
    const scroller = scrollParent(head.current);
    if (scroller) scroller.scrollTop += delta;
    else window.scrollBy(0, delta);
  });

  const current = toneFor(ratingKey, value);

  return (
    <div className="vr rounded-card border p-3" data-rated={value > 0 ? "" : undefined} style={toneVars(current)}>
      <button
        ref={head}
        type="button"
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={open}
        onClick={() => {
          anchor.current = head.current?.getBoundingClientRect().top ?? null;
          onToggle();
        }}
      >
        <span className="vr-icon" aria-hidden>
          <Flame className="size-[1.15rem]" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t(ratingKey)}</span>
          <span className="block text-sm text-dim">
            {value > 0 ? (
              <>
                <span className="vr-chip">{ratingLabel(lang, ratingKey, value)}</span>
{" "}
                <span className="vr-tail">
                  <span className="vr-sep">— </span>
                  {t("tapToChange")}
                </span>
              </>
            ) : (
              t(hintFor(ratingKey))
            )}
          </span>
        </span>
        {value > 0 ? (
          <span className="vr-dots flex shrink-0 gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((level) => (
              <span
                key={level}
                className="vr-dot"
                data-on={level <= value ? "" : undefined}
                style={toneVars(toneFor(ratingKey, level))}
              />
            ))}
          </span>
        ) : null}
        <ChevronDown className={cn("size-4 shrink-0 text-dim transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {[1, 2, 3, 4, 5].map((level) => {
            const selected = value === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => onPick(level)}
                data-level={level}
                data-selected={selected ? "" : undefined}
                style={toneVars(toneFor(ratingKey, level))}
                className="vr-opt flex w-full items-start gap-3 rounded-control border px-3 py-3 text-left"
              >
                <span className="vr-num grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold">
                  {level}
                  {selected ? (
                    <span className="vr-check" aria-hidden>
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="vr-name block font-semibold">{ratingLabel(lang, ratingKey, level)}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-dim">
                    {ratingSentence(lang, ratingKey, level)}
                  </span>
                </span>
                <span className="vr-heat" aria-hidden>
                  <Flame style={{ width: `${0.62 + level * 0.12}rem`, height: `${0.62 + level * 0.12}rem` }} strokeWidth={2} />
                </span>
              </button>
            );
          })}
          {value > 0 ? (
            <button type="button" className="text-sm font-semibold text-danger" onClick={() => onPick(0)}>
              {t("clearRatingBtn")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
