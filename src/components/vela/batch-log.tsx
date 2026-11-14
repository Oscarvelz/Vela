import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarClock, Check, ChevronDown, Eraser, Feather, HeartPulse, MapPin, Minus, Plus, Repeat, Shield, Shuffle, Smile, Sparkles, Tag, UserPlus, WandSparkles } from "lucide-react";
import { parseBatch, type BatchEntry } from "@/lib/vela/batch";
import { useBatchT } from "@/lib/vela/batch-copy";
import { NAMED_PLACES, PLACES, POSITIONS, PROBLEMS, knownProblem, placeLabel, positionLabel } from "@/lib/vela/catalog";
import type { CopyKey } from "@/lib/vela/copy";
import { fmtDate, fmtDateShort, fmtDuration, fmtRange, fmtTime } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { ratingLabel } from "@/lib/vela/notes";
import { useJournal } from "@/lib/vela/store";
import { RATING_KEYS } from "@/lib/vela/types";
import { Button, RatingIcon, Switch, fieldClass, saveBurst } from "./ui";
import { cn } from "@/lib/cn";
import { useBackLayer } from "@/lib/vela/back-stack";

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

const KNOWS = [
  ["kDates", CalendarClock],
  ["kRounds", Repeat],
  ["kPlaces", MapPin],
  ["kPositions", Shuffle],
  ["kProtection", Shield],
  ["kProblems", HeartPulse],
  ["kFelt", Smile],
  ["kBubbles", Tag],
] as const;

export function BatchLog({ onSaved, live = true }: { onSaved: () => void; live?: boolean }) {
  const t = useT();
  const b = useBatchT();
  const lang = useLang();
  const saveBatch = useJournal((s) => s.saveBatch);
  const setBatchDraft = useJournal((s) => s.setBatchDraft);
  const partners = useJournal((s) => s.journal.partners);
  const settings = useJournal((s) => s.journal.settings);
  const defaultPartner = settings.defaultPartner;
  // The work in progress lives in the encrypted journal: whatever was here when the app
  // locked, the page died, or the phone was put away is here again on return (Oscar, Nov 9
  // 2026 — a mid-import app switch used to hand him back an empty sheet).
  const [restored] = useState(() => useJournal.getState().journal.settings.batchDraft);
  const [text, setText] = useState(restored?.text ?? "");
  const [picked, setPicked] = useState(restored?.picked || defaultPartner);
  const [typed, setTyped] = useState(restored?.typed ?? "");
  const [naming, setNaming] = useState(false);
  const [knows, setKnows] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>(restored?.edits ?? {});
  const [open, setOpen] = useState<string | null>(restored?.open ?? null);
  // Keep the stored copy current: debounced as he works, and flushed the moment the page
  // hides — the exact moment he leaves for another app.
  const draftNow = (): { text: string; picked: string; typed: string; edits: Record<string, Edit>; open: string | null } | null =>
    !text.trim() && !typed && Object.keys(edits).length === 0 ? null : { text, picked, typed, edits, open };
  useEffect(() => {
    const id = setTimeout(() => {
      const draft = draftNow();
      setBatchDraft(draft ? { ...draft, at: Date.now() } : undefined);
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, picked, typed, edits, open]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      const draft = draftNow();
      setBatchDraft(draft ? { ...draft, at: Date.now() } : undefined);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, picked, typed, edits, open]);
  // Back / gesture: an open Adjust panel, then the "what Vela understands" note, before Batch itself closes
  // (closing only hides it: the typed text stays).
  useBackLayer(live && knows, () => setKnows(false), { name: "batch-knows" });
  useBackLayer(live && open !== null, () => setOpen(null), { name: "batch-adjust" });
  const area = useRef<HTMLTextAreaElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const recapList = useRef<HTMLOListElement>(null);
  // Recap rows stay on one line: when a row's right side would be cut, drop its place (the card above still shows it).
  useLayoutEffect(() => {
    const list = recapList.current;
    if (!list) return;
    const fit = () => {
      for (const what of list.querySelectorAll<HTMLElement>(".vb-recap-what")) {
        what.classList.remove("is-tight");
        if (what.scrollWidth > what.clientWidth + 1 && what.querySelector(".vb-recap-place")) what.classList.add("is-tight");
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(list);
    return () => observer.disconnect();
  });

  const parsed = useMemo(
    () =>
      parseBatch(text, new Date(), {
        lang,
        partners,
        customPlaces: settings.customPlaces,
        customPositions: settings.customPositions,
        customProblems: settings.customProblems,
      }),
    [text, lang, partners, settings.customPlaces, settings.customPositions, settings.customProblems],
  );
  const cards = parsed.map((entry, index) => {
    const key = keyOf(entry, index);
    const edit = edits[key] ?? {};
    return { key, entry: { ...entry, ...edit } as BatchEntry, skip: Boolean(edit.skip), edited: Boolean(edits[key]) };
  });
  const batchPartner = typed.trim() || picked.trim();
  const kept = cards.filter((card) => !card.skip);
  const missingPartner = kept.some((card) => !card.entry.partnerName && !card.entry.solo && !batchPartner);
  const sessionTotal = kept.reduce((sum, card) => sum + card.entry.count, 0);
  const showName = naming || partners.length === 0 || typed.length > 0;
  const blocked = kept.length === 0 || missingPartner;
  const saveHint =
    cards.length === 0 ? b("saveHintEmpty") : kept.length === 0 ? b("saveHintSkipped") : missingPartner ? b("saveHintPartner") : "";
  const partnerLine = typed.trim()
    ? ""
    : batchPartner
      ? defaultPartner && picked === defaultPartner
        ? b("presetHint")
        : ""
      : b("partnerHint");

  // The journal page grows with the words (and shrinks back), never a scroll box inside a scroll.
  // It can only measure while it can be seen: mounted under the closed (display:none) card, the
  // measurement reads 0 and froze the page at its minimum — a restored draft's words sat trapped
  // behind overflow:hidden where no finger could reach them (Oscar, Nov 14 2026). So it measures
  // again the moment the section opens (`live`), and never writes a height it couldn't measure.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || el.getClientRects().length === 0) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text, live]);

  useEffect(() => {
    if (naming) nameField.current?.focus();
  }, [naming]);

  function patch(key: string, change: Edit) {
    setEdits((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  return (
    <div className="vb">
      <div className="vb-sky" aria-hidden />
      <header className="vb-head">
        <p className="vb-eyebrow">
          <Feather className="size-3.5" strokeWidth={2} aria-hidden />
          {b("eyebrow")}
        </p>
        <h2 className="vb-title font-display">{b("title")}</h2>
        <p className="vb-sub">{b("sub")}</p>
      </header>

      <div className="vb-knows" data-open={knows}>
        <button type="button" className="vb-knows-btn" aria-expanded={knows} onClick={() => setKnows((v) => !v)}>
          <span className="vb-knows-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="flex-1 text-left">{b("knowsTitle")}</span>
          <ChevronDown className="vb-knows-chev size-4" strokeWidth={2} aria-hidden />
        </button>
        <div className="vb-fold" data-open={knows}>
          <div className="vb-fold-in">
            <ul className="vb-knows-list">
              {KNOWS.map(([key, Icon]) => (
                <li key={key} className="vb-knows-chip">
                  <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                  {b(key)}
                </li>
              ))}
            </ul>
            <p className="vb-knows-note">{b("knowsExample")}</p>
          </div>
        </div>
      </div>

      <div className="vb-section">
        <p className="vb-label">{b("pickPartner")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("batchWith")}>
          {partners.map((name) => {
            const on = !typed.trim() && picked === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                className={cn("vb-chip", on ? "ag-chip-on" : "vb-chip-off")}
                onClick={() => {
                  setPicked(name);
                  setTyped("");
                  setNaming(false);
                }}
              >
                {on ? <Check className="size-3.5" strokeWidth={2.6} aria-hidden /> : null}
                {name}
              </button>
            );
          })}
          {showName ? (
            <label className={cn("vb-name", typed.trim() && "is-on")}>
              <UserPlus className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
              <input
                ref={nameField}
                value={typed}
                placeholder={partners.length ? b("newNamePh") : t("newPartnerPh")}
                aria-label={t("batchWith")}
                onChange={(event) => setTyped(event.target.value)}
                onBlur={() => {
                  if (!typed.trim()) setNaming(false);
                }}
              />
            </label>
          ) : (
            <button type="button" className="vb-chip vb-chip-new" onClick={() => setNaming(true)}>
              <Plus className="size-3.5" strokeWidth={2.4} aria-hidden />
              {b("newName")}
            </button>
          )}
        </div>
        {partnerLine ? <p className="vb-hint">{partnerLine}</p> : null}
      </div>

      <div className="vb-page">
        <textarea
          ref={area}
          className="vb-page-text"
          value={text}
          rows={4}
          placeholder={b("placeholder")}
          aria-label={t("batchTitle")}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="vb-page-foot">
          {text ? (
            <button type="button" className="vb-mini" onClick={() => { setText(""); setEdits({}); setOpen(null); setBatchDraft(undefined); area.current?.focus(); }}>
              <Eraser className="size-3.5" strokeWidth={2} aria-hidden />
              {b("clear")}
            </button>
          ) : (
            <button type="button" className="vb-mini vb-mini-accent" data-testid="batch-example" onClick={() => setText(b("sample"))}>
              <WandSparkles className="size-3.5" strokeWidth={2} aria-hidden />
              {b("example")}
            </button>
          )}
        </div>
      </div>

      <div className={cn("vb-status", cards.length > 0 && "is-found")} data-testid="batch-status" aria-live="polite">
        <span className="vb-stars" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} className={i < Math.min(5, kept.length) ? "is-lit" : ""} />
          ))}
        </span>
        {cards.length === 0 ? (
          <span className="vb-status-text">{b("listening")}</span>
        ) : (
          <span className="vb-status-text">
            {b("foundLead")}{" "}
            <span key={cards.length} className="vb-count">
              {cards.length} {cards.length === 1 ? b("moment") : b("moments")}
            </span>
            {kept.length === 0 ? <span className="text-dim"> · {b("allSkipped")}</span> : null}
          </span>
        )}
      </div>

      {cards.length > 0 ? (
        <>
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
          {cards.some((card) => card.edited) ? <p className="vb-hint">{b("resetEdits")}</p> : null}
        </>
      ) : null}

      {kept.length > 0 ? (
        <section className="vb-recap" data-testid="batch-recap" aria-labelledby="vb-recap-title">
          <div className="vb-recap-head">
            <p id="vb-recap-title" className="vb-label">{b("recapTitle")}</p>
            <p className="vb-recap-total" data-testid="batch-recap-total">
              {kept.length} {kept.length === 1 ? b("moment") : b("moments")} · {sessionTotal}{" "}
              {sessionTotal === 1 ? b("sessionWord") : b("sessionsWord")}
              {cards.length > kept.length ? ` · ${b("recapLeftOut").replace("{n}", String(cards.length - kept.length))}` : ""}
            </p>
          </div>
          <ol className="vb-recap-list" ref={recapList}>
            {cards.map((card, index) =>
              card.skip ? null : (
                <li key={card.key}>
                  <button
                    type="button"
                    className="vb-recap-row"
                    data-testid="batch-recap-row"
                    onClick={() => document.querySelectorAll<HTMLElement>("[data-testid=batch-card]")[index]?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  >
                    <span className="vb-recap-num font-display" aria-hidden>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="vb-recap-when">
                      {card.entry.endDate && card.entry.endDate > card.entry.date ? fmtRange(card.entry.date, card.entry.endDate, lang) : fmtDateShort(card.entry.date, lang)}
                      {card.entry.dateStated ? "" : <em className="vb-recap-q"> {b("recapToday")}</em>}
                      {card.entry.timeStated ? (
                        ` · ${fmtTime(card.entry.time, lang)}`
                      ) : (
                        <>
                          {" · "}
                          <span className="vb-time-none" data-testid="batch-no-time">{b("noTime")}</span>
                        </>
                      )}
                    </span>
                    <span className="vb-recap-what">
                      {(() => {
                        const who = card.entry.solo ? t("solo") : card.entry.partnerName || batchPartner;
                        const rest = [card.entry.count > 1 ? `×${card.entry.count}` : "", card.entry.overall > 0 ? `★${card.entry.overall}` : ""].filter(Boolean).join(" · ");
                        const place = card.entry.place ? placeLabel(lang, card.entry.place) : "";
                        // The place sits in its own span so a tight row (narrow phone, "Sin hora") can drop it instead of cutting words.
                        return (
                          <>
                            {who}
                            {place ? <span className="vb-recap-place">{who ? " · " : ""}{place}</span> : null}
                            {rest ? `${who || place ? " · " : ""}${rest}` : ""}
                          </>
                        );
                      })()}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ol>
          {batchPartner || kept.every((card) => card.entry.partnerName || card.entry.solo) ? (
            <p className="vb-recap-who">
              {(() => {
                const names = [...new Set(kept.map((card) => (card.entry.solo ? t("solo") : card.entry.partnerName || batchPartner)).filter(Boolean))];
                return b("recapWith").replace("{name}", names.join(", "));
              })()}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="vb-save-wrap">
        <Button
          variant="save"
          className="vb-save w-full rounded-control text-base"
          data-testid="batch-save"
          disabled={blocked}
          aria-describedby={saveHint ? "vb-save-hint" : undefined}
          onClick={(event) => {
            if (blocked) return;
            saveBurst(event.currentTarget);
            saveBatch(
              kept.map((card) => card.entry),
              batchPartner,
            );
            setText("");
            setTyped("");
            setNaming(false);
            setEdits({});
            setOpen(null);
            setBatchDraft(undefined);
            onSaved();
          }}
        >
          <span className="ag-save-ico" aria-hidden>
            <Sparkles className="size-[18px]" strokeWidth={2.2} />
          </span>
          {kept.length > 0
            ? `${t("batchSave")} · ${sessionTotal} ${sessionTotal === 1 ? b("sessionWord") : b("sessionsWord")}`
            : t("batchSave")}
        </Button>
        {saveHint ? (
          <p id="vb-save-hint" className="vb-save-hint">
            {saveHint}
          </p>
        ) : null}
      </div>
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
  const partner = entry.solo ? t("solo") : entry.partnerName || batchPartner;
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
    <li className={cn("vb-card", skip && "is-skip")} data-testid="batch-card">
      <div className="vb-card-head">
        <span className="vb-card-num font-display" aria-hidden>
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="vb-card-kicker">{entry.title || `${b("entryN")} ${index + 1}`}</p>
          <p className="vb-card-date font-display">
            {entry.endDate && entry.endDate > entry.date ? fmtRange(entry.date, entry.endDate, lang) : fmtDate(entry.date, lang)}
          </p>
          <p className="vb-card-meta">
            {entry.timeStated ? fmtTime(entry.time, lang) : <span className="vb-time-none" data-testid="batch-no-time">{b("noTime")}</span>}
            {" · "}
            {entry.count} {entry.count === 1 ? b("round") : b("rounds")}
            {entry.nextDay ? ` · ${t("throughTomorrow")}` : ""}
          </p>
        </div>
      </div>
      {!entry.dateStated ? <p className="vb-card-warn">{b("assumedDate")}</p> : null}
      <p className="vb-card-who">
        {t("withWhom")}{" "}
        <span className="font-semibold text-fg">{partner || b("noPartner")}</span>
        {partner && !entry.solo ? (
          entry.partnerName && entry.partnerUnsure ? (
            <span className="vb-card-src is-check" data-testid="batch-partner-check"> · {b("partnerCheck")}</span>
          ) : (
            <span className="vb-card-src"> · {entry.partnerName ? b("partnerFromText") : b("partnerFallback")}</span>
          )
        ) : null}
      </p>

      {skip ? (
        <p className="mt-2 text-sm text-dim">{b("skipped")}</p>
      ) : (
        <>
          {anything ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <span key={`${tag.label}-${tag.value}-${i}`} className="vb-tag" title={tag.label}>
                  {tag.value}
                </span>
              ))}
              {feelings.map((key) => (
                <span key={key} className="vb-tag">
                  {t(key)} · {ratingLabel(lang, key, entry[key])}
                </span>
              ))}
              {entry.durationMins > 0 ? <span className="vb-tag">{fmtDuration(entry.durationMins)}</span> : null}
              {entry.overall > 0 ? (
                <span className="vb-tag vb-tag-rate" aria-label={`${t("overall")} ${entry.overall} ${t("of5")}`}>
                  {[1, 2, 3, 4, 5].map((level) => (
                    <RatingIcon key={level} style={ratingStyle} className="size-3.5" active={entry.overall >= level} />
                  ))}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-dim">{b("nothingFound")}</p>
          )}
          <div className="vb-note">
            <p className="vb-note-label">{b("note")}</p>
            <p className="vb-note-text">{entry.notes || <span className="vb-note-empty">{b("noteEmpty")}</span>}</p>
          </div>
          {open ? <EntryEditor entry={entry} onChange={onChange} /> : null}
        </>
      )}

      <div className="vb-card-actions">
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
    <div className="mt-3 space-y-[0.9rem] rounded-[1.1rem] border border-fg/18 bg-bg/50 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-semibold text-fg/70">{t("date")}</span>
          <input
            type="date"
            className={cn(fieldClass, "px-2.5 py-2 text-sm")}
            value={entry.date}
            onChange={(event) => event.target.value && onChange({ date: event.target.value, endDate: event.target.value, dateStated: true })}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-semibold text-fg/70">{t("time")}</span>
          <input
            type="time"
            className={cn(fieldClass, "px-2.5 py-2 text-sm")}
            value={entry.time}
            onChange={(event) => event.target.value && onChange({ time: event.target.value, timeStated: true, times: [] })}
          />
        </label>
      </div>

      {/* Rounds is a small stack — its word on top, the stepper under it — so the overnight
          switch and its label get the rest of the row to themselves. Squeezed into one line,
          "Ends the next day" broke into four stacked words (Oscar's layout, Nov 9 2026). */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[13px] font-semibold">{b("rounds2")}</p>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="−" className="grid size-7 place-items-center rounded-full border border-border" onClick={() => onChange({ count: Math.max(1, entry.count - 1) })}>
              <Minus className="size-3.5" />
            </button>
            <span className="w-5 text-center text-sm font-semibold tabular-nums">{entry.count}</span>
            <button type="button" aria-label="+" className="grid size-7 place-items-center rounded-full border border-border" onClick={() => onChange({ count: Math.min(12, entry.count + 1) })}>
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <span className="max-w-[8rem] text-xs font-semibold leading-snug text-fg/80">{b("nextDay")}</span>
          <Switch checked={entry.nextDay} label={b("nextDay")} onChange={(nextDay) => onChange({ nextDay })} />
        </div>
      </div>

      <Group title={b("pickPartner")}>
        {partners.map((name) => (
          <Chip key={name} on={!entry.solo && entry.partnerName === name} onClick={() => onChange({ partnerName: entry.partnerName === name && !entry.solo ? "" : name, solo: false, partnerUnsure: false })}>
            {name}
          </Chip>
        ))}
        {(entry.partnerAlts ?? [])
          .filter((name, i, list) => !partners.includes(name) && name !== entry.partnerName && list.indexOf(name) === i)
          .map((name) => (
            <Chip key={`alt-${name}`} on={false} onClick={() => onChange({ partnerName: name, solo: false, partnerUnsure: false })}>
              {name}
            </Chip>
          ))}
        {entry.partnerName && !partners.includes(entry.partnerName) ? (
          <Chip on={!entry.solo} onClick={() => onChange({ partnerName: "", partnerUnsure: false })}>
            {entry.partnerName}
          </Chip>
        ) : null}
        <Chip on={Boolean(entry.solo)} onClick={() => onChange({ solo: !entry.solo, partnerName: entry.solo ? entry.partnerName : "" })}>
          {t("solo")}
        </Chip>
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

      {/* One line per feeling: the name with the level's word under it, then the five flames.
          Six stacked label-plus-row blocks were the tallest part of the old sheet; the word
          rides in the name's column because the row has no room for a third column. */}
      <div className="space-y-1.5">
        {RATING_KEYS.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-[6.2rem] shrink-0">
              <span className="block truncate text-[13px] font-semibold leading-tight">{t(key)}</span>
              <span className="block truncate text-[11px] leading-tight text-fg/70">{entry[key] ? ratingLabel(lang, key, entry[key]) : b("notStated")}</span>
            </span>
            <LevelRow value={entry[key]} style={ratingStyle} label={t(key)} onPick={(level) => onChange({ [key]: entry[key] === level ? 0 : level } as Edit)} />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-[6.2rem] shrink-0">
            <span className="block truncate text-[13px] font-semibold leading-tight">{t("overall")}</span>
            <span className="block truncate text-[11px] leading-tight text-fg/70">{entry.overall ? `${entry.overall} ${t("of5")}` : b("notStated")}</span>
          </span>
          <LevelRow value={entry.overall} style={ratingStyle} label={t("overallRatingAria")} onPick={(level) => onChange({ overall: entry.overall === level ? 0 : level })} />
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold">{b("note")}</span>
        <textarea className={cn(fieldClass, "min-h-16 resize-y text-sm leading-relaxed")} value={entry.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  // The editor's own bubble (.vb-bub): air inside and a finished surface in both states —
  // the shared gold when on, a quiet top-lit glass when off (styles.css).
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("vb-bub", on ? "ag-chip-on" : "vb-bub-off")}>
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
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          aria-pressed={value >= level}
          aria-label={`${label} ${level}`}
          onClick={() => onPick(level)}
          className={cn(
            "grid size-8 place-items-center rounded-lg border transition-colors duration-200",
            value >= level ? "ag-rate-on border-accent" : "border-border bg-gradient-to-b from-white/[0.05] to-transparent",
          )}
        >
          <RatingIcon style={style} className="size-4" active={value >= level} />
        </button>
      ))}
    </div>
  );
}
