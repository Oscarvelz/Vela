import { useMemo, useState, type ReactNode } from "react";
import { Minus, Plus, Sparkles } from "lucide-react";
import { parseBatch, type BatchEntry } from "@/lib/vela/batch";
import { useBatchT } from "@/lib/vela/batch-copy";
import { NAMED_PLACES, PLACES, POSITIONS, PROBLEMS, knownProblem, placeLabel, positionLabel } from "@/lib/vela/catalog";
import type { CopyKey } from "@/lib/vela/copy";
import { fmtDate, fmtDuration, fmtTime } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { ratingLabel } from "@/lib/vela/notes";
import { useJournal } from "@/lib/vela/store";
import { RATING_KEYS } from "@/lib/vela/types";
import { Button, RatingIcon, Switch, fieldClass } from "./ui";
import { cn } from "@/lib/cn";

const METHODS = [
  ["pullout", "methodPullout"],
  ["pill", "methodPill"],
  ["condom", "methodCondom"],
  ["iud", "methodIud"],
  ["implant", "methodImplant"],
  ["none", "methodNone"],
] as const;

const DURATIONS = [15, 30, 45, 60, 90];

type Edit = Partial<BatchEntry> & { skip?: boolean };

function keyOf(entry: BatchEntry, index: number) {
  return `${index}:${entry.source}`;
}

export function BatchLog({ onSaved }: { onSaved: () => void }) {
  const t = useT();
  const b = useBatchT();
  const saveBatch = useJournal((s) => s.saveBatch);
  const partners = useJournal((s) => s.journal.partners);
  const settings = useJournal((s) => s.journal.settings);
  const defaultPartner = settings.defaultPartner;
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(defaultPartner);
  const [typed, setTyped] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [open, setOpen] = useState<string | null>(null);

  const parsed = useMemo(
    () =>
      parseBatch(text, new Date(), {
        partners,
        customPlaces: settings.customPlaces,
        customPositions: settings.customPositions,
        customProblems: settings.customProblems,
      }),
    [text, partners, settings.customPlaces, settings.customPositions, settings.customProblems],
  );
  const cards = parsed.map((entry, index) => {
    const key = keyOf(entry, index);
    const edit = edits[key] ?? {};
    return { key, entry: { ...entry, ...edit } as BatchEntry, skip: Boolean(edit.skip), edited: Boolean(edits[key]) };
  });
  const batchPartner = typed.trim() || picked.trim();
  const kept = cards.filter((card) => !card.skip);
  const missingPartner = kept.some((card) => !card.entry.partnerName && !batchPartner);
  const sessionTotal = kept.reduce((sum, card) => sum + card.entry.count, 0);

  function patch(key: string, change: Edit) {
    setEdits((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-dim">{b("hint")}</p>
      <div>
        <p className="mb-2 text-sm font-semibold">{t("batchWith")}</p>
        <div className="flex flex-wrap gap-2">
          {partners.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={!typed && picked === name}
              className={cn(
                "min-h-10 rounded-full border px-3 text-sm font-semibold",
                !typed && picked === name ? "ag-chip-on" : "border-border text-fg",
              )}
              onClick={() => {
                setPicked(name);
                setTyped("");
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <input
          className={cn(fieldClass, "mt-3")}
          value={typed}
          placeholder={t("newPartnerPh")}
          aria-label={t("batchWith")}
          onChange={(event) => setTyped(event.target.value)}
        />
        <p className="mt-2 text-sm leading-relaxed text-dim">{batchPartner || t("batchNeedPartner")}</p>
      </div>
      <textarea
        className={cn(fieldClass, "min-h-44 resize-y leading-relaxed")}
        value={text}
        placeholder={b("placeholder")}
        aria-label={t("batchTitle")}
        onChange={(event) => setText(event.target.value)}
      />
      {cards.length === 0 ? (
        <p className="text-sm text-dim">{t("batchEmpty")}</p>
      ) : (
        <>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-fg/70 uppercase">
            <Sparkles className="size-3.5 text-accent" strokeWidth={1.75} />
            {b("found")}
          </p>
          <ul className="space-y-3">
            {cards.map((card, index) => (
              <EntryCard
                key={card.key}
                index={index}
                entry={card.entry}
                skip={card.skip}
                open={open === card.key}
                batchPartner={batchPartner}
                onToggle={() => setOpen((current) => (current === card.key ? null : card.key))}
                onSkip={(skip) => patch(card.key, { skip })}
                onChange={(change) => patch(card.key, change)}
              />
            ))}
          </ul>
          {cards.some((card) => card.edited) ? <p className="text-xs leading-relaxed text-fg/60">{b("resetEdits")}</p> : null}
        </>
      )}
      <Button
        className="w-full"
        disabled={kept.length === 0 || missingPartner}
        onClick={() => {
          if (kept.length === 0 || missingPartner) return;
          saveBatch(
            kept.map((card) => card.entry),
            batchPartner,
          );
          setText("");
          setTyped("");
          setEdits({});
          setOpen(null);
          onSaved();
        }}
      >
        {kept.length > 0
          ? `${t("batchSave")} · ${sessionTotal} ${sessionTotal === 1 ? b("sessionWord") : b("sessionsWord")}`
          : t("batchSave")}
      </Button>
    </div>
  );
}

function EntryCard({
  index,
  entry,
  skip,
  open,
  batchPartner,
  onToggle,
  onSkip,
  onChange,
}: {
  index: number;
  entry: BatchEntry;
  skip: boolean;
  open: boolean;
  batchPartner: string;
  onToggle: () => void;
  onSkip: (skip: boolean) => void;
  onChange: (change: Edit) => void;
}) {
  const t = useT();
  const b = useBatchT();
  const lang = useLang();
  const ratingStyle = useJournal((s) => s.journal.settings.ratingStyle);
  const partner = entry.partnerName || batchPartner;
  const methodName = (id: string) => {
    const row = METHODS.find((item) => item[0] === id);
    return row ? t(row[1]) : id;
  };
  const problemName = (id: string) => {
    const known = knownProblem(id);
    return known ? t(known) : id;
  };
  const tags: { label: string; value: string }[] = [];
  if (entry.place) tags.push({ label: t("place"), value: placeLabel(lang, entry.place) });
  for (const position of entry.positions) tags.push({ label: t("positions"), value: positionLabel(lang, position) });
  for (const id of entry.contraception) tags.push({ label: t("contraception"), value: methodName(id) });
  for (const id of entry.problems) tags.push({ label: t("problems"), value: problemName(id) });
  const feelings = RATING_KEYS.filter((key) => entry[key] > 0);
  const anything = tags.length > 0 || feelings.length > 0 || entry.overall > 0 || entry.durationMins > 0;

  return (
    <li className={cn("rounded-2xl border border-l-4 bg-surface px-3 py-3", skip ? "border-fg/15 border-l-fg/25 opacity-60" : "border-fg/22 border-l-accent")}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold tracking-wide text-on-accent">
          {entry.title || `${b("entryN")} ${index + 1}`}
        </span>
        <span className="text-sm font-semibold">{fmtDate(entry.date, lang)}</span>
        <span className="text-sm text-dim">
          · {fmtTime(entry.time, lang)}
          {entry.timeStated ? "" : ` (${b("assumedTime")})`}
        </span>
        <span className="text-sm text-dim">
          · {entry.count} {entry.count === 1 ? b("round") : b("rounds")}
          {entry.nextDay ? ` · ${t("throughTomorrow")}` : ""}
        </span>
      </div>
      {!entry.dateStated ? <p className="mt-1 text-xs font-semibold text-accent">{b("assumedDate")}</p> : null}
      <p className="mt-1 text-sm text-fg/80">
        {t("withWhom")}{" "}
        <span className="font-semibold text-fg">{partner || b("noPartner")}</span>
        {partner ? <span className="text-xs text-fg/60"> · {entry.partnerName ? b("partnerFromText") : b("partnerFallback")}</span> : null}
      </p>

      {skip ? (
        <p className="mt-2 text-sm text-dim">{b("skipped")}</p>
      ) : (
        <>
          {anything ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <span key={`${tag.label}-${tag.value}-${i}`} className="ag-chip-on inline-flex min-h-8 items-center rounded-full border px-3 text-[0.78rem] font-semibold" title={tag.label}>
                  {tag.value}
                </span>
              ))}
              {feelings.map((key) => (
                <span key={key} className="ag-chip-on inline-flex min-h-8 items-center rounded-full border px-3 text-[0.78rem] font-semibold">
                  {t(key)} · {ratingLabel(lang, key, entry[key])}
                </span>
              ))}
              {entry.durationMins > 0 ? (
                <span className="ag-chip-on inline-flex min-h-8 items-center rounded-full border px-3 text-[0.78rem] font-semibold">
                  {fmtDuration(entry.durationMins)}
                </span>
              ) : null}
              {entry.overall > 0 ? (
                <span className="ag-chip-on inline-flex min-h-8 items-center gap-0.5 rounded-full border px-3 text-[0.78rem] font-semibold" aria-label={`${t("overall")} ${entry.overall} ${t("of5")}`}>
                  {[1, 2, 3, 4, 5].map((level) => (
                    <RatingIcon key={level} style={ratingStyle} className="size-3.5" active={entry.overall >= level} />
                  ))}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-dim">{b("nothingFound")}</p>
          )}
          <div className="mt-2 rounded-xl border border-fg/18 bg-bg/50 px-3 py-2">
            <p className="text-[11px] font-semibold tracking-wide text-fg/60 uppercase">{b("note")}</p>
            <p className="mt-0.5 text-sm leading-relaxed">{entry.notes || <span className="text-dim">{b("noteEmpty")}</span>}</p>
          </div>
          {open ? <EntryEditor entry={entry} onChange={onChange} /> : null}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!skip ? (
          <Button variant={open ? "soft" : "ghost"} className="min-h-10 px-4" aria-expanded={open} onClick={onToggle}>
            {open ? b("done") : b("adjust")}
          </Button>
        ) : null}
        <Button variant="ghost" className="min-h-10 px-4 text-fg/80" onClick={() => onSkip(!skip)}>
          {skip ? b("include") : b("skip")}
        </Button>
      </div>
    </li>
  );
}

function EntryEditor({ entry, onChange }: { entry: BatchEntry; onChange: (change: Edit) => void }) {
  const t = useT();
  const b = useBatchT();
  const lang = useLang();
  const partners = useJournal((s) => s.journal.partners);
  const settings = useJournal((s) => s.journal.settings);
  const ratingStyle = settings.ratingStyle;
  const places = [...PLACES.filter((place) => place !== "Other"), ...NAMED_PLACES.map((place) => place.name), ...settings.customPlaces];
  if (entry.place && !places.includes(entry.place)) places.push(entry.place);
  const positions = [...POSITIONS.filter((position) => position !== "Other"), ...settings.customPositions];
  for (const position of entry.positions) if (!positions.includes(position)) positions.push(position);
  const problems = [
    ...PROBLEMS.map(([id]) => id as string),
    ...settings.customProblems.filter((item) => !PROBLEMS.some((row) => row[0] === item)),
  ];
  for (const id of entry.problems) if (!problems.includes(id)) problems.push(id);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const problemName = (id: string) => {
    const known = knownProblem(id);
    return known ? t(known) : id;
  };

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-fg/18 bg-bg/50 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-fg/70">{t("date")}</span>
          <input
            type="date"
            className={cn(fieldClass, "px-3 py-2 text-sm")}
            value={entry.date}
            onChange={(event) => event.target.value && onChange({ date: event.target.value, dateStated: true })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-fg/70">{t("time")}</span>
          <input
            type="time"
            className={cn(fieldClass, "px-3 py-2 text-sm")}
            value={entry.time}
            onChange={(event) => event.target.value && onChange({ time: event.target.value, timeStated: true, times: [] })}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{b("rounds2")}</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="−" className="grid size-10 place-items-center rounded-full border border-border" onClick={() => onChange({ count: Math.max(1, entry.count - 1) })}>
            <Minus className="size-4" />
          </button>
          <span className="w-6 text-center font-semibold tabular-nums">{entry.count}</span>
          <button type="button" aria-label="+" className="grid size-10 place-items-center rounded-full border border-border" onClick={() => onChange({ count: Math.min(12, entry.count + 1) })}>
            <Plus className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{b("nextDay")}</span>
        <Switch checked={entry.nextDay} label={b("nextDay")} onChange={(nextDay) => onChange({ nextDay })} />
      </div>

      <Group title={b("pickPartner")}>
        {partners.map((name) => (
          <Chip key={name} on={entry.partnerName === name} onClick={() => onChange({ partnerName: entry.partnerName === name ? "" : name })}>
            {name}
          </Chip>
        ))}
        {entry.partnerName && !partners.includes(entry.partnerName) ? (
          <Chip on onClick={() => onChange({ partnerName: "" })}>
            {entry.partnerName}
          </Chip>
        ) : null}
      </Group>

      <Group title={t("place")}>
        {places.map((place) => (
          <Chip key={place} on={entry.place === place} onClick={() => onChange({ place: entry.place === place ? "" : place })}>
            {placeLabel(lang, place)}
          </Chip>
        ))}
      </Group>

      <Group title={t("positions")}>
        {positions.map((position) => (
          <Chip key={position} on={entry.positions.includes(position)} onClick={() => onChange({ positions: toggle(entry.positions, position) })}>
            {positionLabel(lang, position)}
          </Chip>
        ))}
      </Group>

      <Group title={t("contraception")}>
        {METHODS.map(([id, label]) => (
          <Chip key={id} on={entry.contraception.includes(id)} onClick={() => onChange({ contraception: toggle(entry.contraception, id) })}>
            {t(label as CopyKey)}
          </Chip>
        ))}
      </Group>

      <Group title={t("problems")}>
        {problems.map((id) => (
          <Chip key={id} on={entry.problems.includes(id)} onClick={() => onChange({ problems: toggle(entry.problems, id) })}>
            {problemName(id)}
          </Chip>
        ))}
      </Group>

      <Group title={b("duration")}>
        <Chip on={!entry.durationMins} onClick={() => onChange({ durationMins: 0 })}>
          {b("notStated")}
        </Chip>
        {[...DURATIONS, ...(entry.durationMins && !DURATIONS.includes(entry.durationMins) ? [entry.durationMins] : [])].map((mins) => (
          <Chip key={mins} on={entry.durationMins === mins} onClick={() => onChange({ durationMins: mins })}>
            {fmtDuration(mins)}
          </Chip>
        ))}
      </Group>

      <div className="space-y-3">
        {RATING_KEYS.map((key) => (
          <div key={key}>
            <p className="mb-1.5 text-sm font-semibold">
              {t(key)}
              <span className="font-normal text-fg/70"> — {entry[key] ? ratingLabel(lang, key, entry[key]) : b("notStated")}</span>
            </p>
            <LevelRow value={entry[key]} style={ratingStyle} label={t(key)} onPick={(level) => onChange({ [key]: entry[key] === level ? 0 : level } as Edit)} />
          </div>
        ))}
        <div>
          <p className="mb-1.5 text-sm font-semibold">
            {t("overall")}
            <span className="font-normal text-fg/70"> — {entry.overall ? `${entry.overall} ${t("of5")}` : b("notStated")}</span>
          </p>
          <LevelRow value={entry.overall} style={ratingStyle} label={t("overallRatingAria")} onPick={(level) => onChange({ overall: entry.overall === level ? 0 : level })} />
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold">{b("note")}</span>
        <textarea className={cn(fieldClass, "min-h-24 resize-y text-sm leading-relaxed")} value={entry.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("min-h-[37px] rounded-full border px-[0.85rem] text-[0.8rem] font-semibold", on ? "ag-chip-on" : "ag-pill border-border text-fg")}
    >
      {children}
    </button>
  );
}

function LevelRow({
  value,
  style,
  label,
  onPick,
}: {
  value: number;
  style: "flame" | "star" | "heart";
  label: string;
  onPick: (level: number) => void;
}) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          aria-pressed={value >= level}
          aria-label={`${label} ${level}`}
          onClick={() => onPick(level)}
          className={cn(
            "grid size-10 place-items-center rounded-xl border transition-colors duration-200",
            value >= level ? "ag-rate-on border-accent" : "border-border",
          )}
        >
          <RatingIcon style={style} className="size-4" active={value >= level} />
        </button>
      ))}
    </div>
  );
}
