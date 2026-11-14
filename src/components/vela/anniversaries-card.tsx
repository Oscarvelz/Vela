/* Anniversaries & Your people (2.1.24) — the settled place for the dates a
   user chose never to forget. History hosts it: management lives here, while
   the day itself also blooms on Home among the Memories. Every row carries
   its living counter and sorts by what comes next; milestones wear the
   aurora. Children are people with birthdays — same engine, same list. */
import { useEffect, useState } from "react";
import { Cake, CalendarHeart, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  cleanAnniversaries,
  cleanChildren,
  counterSince,
  newDateId,
  occurrenceInYear,
  upcomingDates,
  type UpcomingDate,
} from "@/lib/vela/anniversaries";
import type { CopyKey } from "@/lib/vela/copy";
import { fill } from "@/lib/vela/cycle-words";
import { fmtDate, parseDate, todayStr } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import type { Anniversary, AnniversaryKind, ChildEntry, ChildRef } from "@/lib/vela/types";
import { Sparkle } from "./mark";
import { Button, Card, ConfirmDialog, Switch, fieldClass } from "./ui";
import { cn } from "@/lib/cn";

const KINDS: { id: AnniversaryKind; key: CopyKey }[] = [
  { id: "met", key: "annKindMet" },
  { id: "married", key: "annKindMarried" },
  { id: "first", key: "annKindFirst" },
  { id: "custom", key: "annKindCustom" },
];
const REFS: { id: ChildRef; key: CopyKey }[] = [
  { id: "son", key: "annRefSon" },
  { id: "daughter", key: "annRefDaughter" },
  { id: "child", key: "annRefName" },
];

/** The counter arrives once (research brief, 2.1.26): small sacred numbers tick
 *  through each integer — 0→9 over ~900 ms feels like nine arrivals — while
 *  larger ones sweep on an ease-out-expo capped at 1.4 s. It runs a single
 *  time per session per date: a ceremony repeated on every tab switch becomes
 *  noise by day three. Reduced motion renders the final number, always. */
const countedOnce = new Set<string>();

function CountUp({ value, id }: { value: number; id: string }) {
  const [shown, setShown] = useState(() => (countedOnce.has(id) || value <= 1 ? value : 0));
  useEffect(() => {
    if (countedOnce.has(id) || value <= 1) {
      setShown(value);
      return;
    }
    countedOnce.add(id);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    if (value <= 20) {
      let n = 0;
      const stepMs = Math.min(110, Math.max(60, Math.floor(1400 / value)));
      const iv = setInterval(() => {
        n += 1;
        setShown(n);
        if (n >= value) clearInterval(iv);
      }, stepMs);
      return () => clearInterval(iv);
    }
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      if (p >= 1) {
        setShown(value);
        return;
      }
      setShown(Math.round(value * (1 - Math.pow(2, -10 * p))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, id]);
  return <>{shown}</>;
}

function unitKey(unit: "days" | "months" | "years"): CopyKey {
  return unit === "years" ? "annYearsWord" : unit === "months" ? "annMonthsWord" : "annDaysWord";
}

export function AnniversariesCard() {
  const t = useT();
  const lang = useLang();
  // RAW selections only (house lesson): derive in the body, never in a selector.
  const settings = useJournal((s) => s.journal.settings);
  const partners = useJournal((s) => s.journal.partners);
  const openHistRange = useJournal((s) => s.openHistRange);
  const saveAnniversary = useJournal((s) => s.saveAnniversary);
  const deleteAnniversary = useJournal((s) => s.deleteAnniversary);
  const saveChild = useJournal((s) => s.saveChild);
  const deleteChild = useJournal((s) => s.deleteChild);
  const anniversaries = cleanAnniversaries(settings.anniversaries);
  const children = cleanChildren(settings.children);
  const today = todayStr();
  const upcoming = upcomingDates(settings, today);

  const [formFor, setFormFor] = useState<Anniversary | "new" | null>(null);
  const [childFormFor, setChildFormFor] = useState<ChildEntry | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Anniversary | null>(null);
  const [confirmChildDelete, setConfirmChildDelete] = useState<ChildEntry | null>(null);

  const tapDateFor = (u: UpcomingDate): string | null => {
    if (u.origin) return u.origin;
    const a = anniversaries.find((x) => x.id === u.id);
    if (!a) return null;
    const year = parseDate(u.date).getFullYear() - (u.daysUntil === 0 ? 0 : 1);
    return occurrenceInYear(a.monthDay, year);
  };

  const secondaryLine = (u: UpcomingDate): string => {
    if (u.source === "birthday") {
      if (u.daysUntil === 0) return fill(t("annTurnsToday"), { age: u.turning ?? "" });
      if (u.daysUntil === 1) return fill(t("annTurnsTomorrow"), { age: u.turning ?? "" });
      return fill(t("annTurnsIn"), { age: u.turning ?? "", n: u.daysUntil });
    }
    if (u.daysUntil === 0) {
      if (u.turning && u.turning >= 1 && u.kind === "married") return fill(t("annMarriedDay"), { n: u.turning });
      if (u.turning && u.turning >= 1 && u.kind === "met") return fill(t("annMetDay"), { n: u.turning });
      if (u.turning && u.turning >= 1 && u.kind === "first") return fill(t("annFirstDay"), { n: u.turning });
      if (u.turning && u.turning >= 1) return fill(t("annYearsToday"), { n: u.turning });
      return t("annTodayPlain");
    }
    return u.daysUntil === 1 ? t("annInOneDay") : fill(t("annInDays"), { n: u.daysUntil });
  };

  const counterFor = (u: UpcomingDate): { n: number; unit: string } | null => {
    if (u.daysUntil === 0 && u.turning && u.turning >= 1) return { n: u.turning, unit: t("annYearsWord") };
    if (u.elapsed && u.elapsed.n >= 1) return { n: u.elapsed.n, unit: t(unitKey(u.elapsed.unit)) };
    return null;
  };

  return (
    <Card className="ag-glass p-4" data-testid="anniversaries-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <Sparkle className="h-4 w-4 text-[var(--ag-accent)]" />
            {t("annTitle")}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--ag-dim)]">{t("annSectionHint")}</p>
        </div>
        <button
          type="button"
          data-testid="ann-add"
          className="ag-chip shrink-0"
          onClick={() => setFormFor("new")}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("annAdd")}
        </button>
      </div>

      {upcoming.length === 0 && formFor === null ? (
        <p className="mt-3 text-sm leading-relaxed text-[var(--ag-dim)]">{t("annEmpty")}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {upcoming.map((u) => {
            const counter = counterFor(u);
            const raw = u.source === "anniversary" ? anniversaries.find((x) => x.id === u.id) : undefined;
            const tapDate = tapDateFor(u);
            return (
              <div
                key={u.key}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border border-[var(--ag-border)] px-3 py-2.5",
                  u.milestone && "ag-aurora",
                  u.milestone && u.daysUntil === 0 && "ag-ann-today",
                )}
                data-testid="ann-row"
                data-milestone={u.milestone || undefined}
              >
                {counter ? (
                  <div className="w-14 shrink-0 text-center">
                    <div className="font-display text-2xl font-bold leading-none text-[var(--ag-accent)]">
                      <CountUp value={counter.n} id={u.key} />
                    </div>
                    <div className="mt-0.5 text-[0.62rem] uppercase tracking-wide text-[var(--ag-dim)]">{counter.unit}</div>
                  </div>
                ) : (
                  <div className="flex w-14 shrink-0 justify-center text-[var(--ag-dim)]">
                    {u.source === "birthday" ? <Cake className="h-5 w-5" /> : <CalendarHeart className="h-5 w-5" />}
                  </div>
                )}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  disabled={!tapDate}
                  onClick={() => tapDate && openHistRange(tapDate, tapDate)}
                >
                  <span className="block truncate text-sm font-semibold">
                    {u.label}
                    {u.personName ? <span className="font-normal text-[var(--ag-dim)]"> · {u.personName}</span> : null}
                  </span>
                  <span
                    className={cn("block text-xs", u.daysUntil === 0 ? "font-semibold text-[var(--ag-accent)]" : "text-[var(--ag-dim)]")}
                    style={
                      // A milestone's date warms into the accent across its final
                      // week (research brief, 2.1.26) — daily steps, full gold on
                      // the day itself, gone the morning after.
                      u.milestone && u.daysUntil >= 1 && u.daysUntil <= 7
                        ? { color: `color-mix(in srgb, var(--ag-accent) ${Math.round(((8 - u.daysUntil) / 7) * 100)}%, var(--ag-dim))` }
                        : undefined
                    }
                  >
                    {secondaryLine(u)}
                    {u.source === "anniversary" ? ` · ${fmtDate(u.date, lang)}` : ""}
                  </span>
                  {raw?.note ? <span className="mt-0.5 block truncate text-xs italic text-[var(--ag-dim)]">{raw.note}</span> : null}
                </button>
                {raw ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-2 text-[var(--ag-dim)]"
                    aria-label={t("annFormEdit")}
                    data-testid="ann-edit"
                    onClick={() => setFormFor(raw)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {formFor !== null ? (
        <AnniversaryForm
          initial={formFor === "new" ? null : formFor}
          partners={partners}
          onClose={() => setFormFor(null)}
          onSave={(a) => {
            saveAnniversary(a);
            setFormFor(null);
          }}
          onDelete={(a) => setConfirmDelete(a)}
        />
      ) : null}

      <div className="mt-4 border-t border-[var(--ag-border)] pt-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">{t("annPeopleTitle")}</h4>
          <button type="button" data-testid="child-add" className="ag-chip shrink-0" onClick={() => setChildFormFor("new")}>
            <Plus className="h-3.5 w-3.5" />
            {t("annChildAdd")}
          </button>
        </div>
        {children.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {children.map((c) => {
              const age = counterSince(Number(c.birthdate.slice(0, 4)), c.birthdate.slice(5), today);
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5" data-testid="child-row">
                  <Cake className="h-4 w-4 shrink-0 text-[var(--ag-dim)]" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-[var(--ag-dim)]">
                      {fmtDate(c.birthdate, lang)}
                      {age && age.n >= 1 ? ` · ${age.n} ${t(unitKey(age.unit))}` : ""}
                      {` · ${t(REFS.find((r) => r.id === c.refAs)?.key ?? "annRefName")}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-2 text-[var(--ag-dim)]"
                    aria-label={t("annFormEdit")}
                    data-testid="child-edit"
                    onClick={() => setChildFormFor(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-2 text-[var(--ag-dim)]"
                    aria-label={t("annDelete")}
                    data-testid="child-delete"
                    onClick={() => setConfirmChildDelete(c)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        {childFormFor !== null ? (
          <ChildForm
            initial={childFormFor === "new" ? null : childFormFor}
            onClose={() => setChildFormFor(null)}
            onSave={(c) => {
              saveChild(c);
              setChildFormFor(null);
            }}
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={t("annDelete")}
        name={confirmDelete?.label}
        confirmLabel={t("delete")}
        cancelLabel={t("cancelBtn")}
        onConfirm={() => {
          if (confirmDelete) deleteAnniversary(confirmDelete.id);
          setConfirmDelete(null);
          setFormFor(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        <p className="text-sm text-[var(--ag-dim)]">{t("annDeleteQ")}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(confirmChildDelete)}
        title={t("annDelete")}
        name={confirmChildDelete?.name}
        confirmLabel={t("delete")}
        cancelLabel={t("cancelBtn")}
        onConfirm={() => {
          if (confirmChildDelete) deleteChild(confirmChildDelete.id);
          setConfirmChildDelete(null);
        }}
        onCancel={() => setConfirmChildDelete(null)}
      >
        <p className="text-sm text-[var(--ag-dim)]">{confirmChildDelete ? fill(t("annChildDeleteQ"), { name: confirmChildDelete.name }) : ""}</p>
      </ConfirmDialog>
    </Card>
  );
}

function AnniversaryForm({
  initial,
  partners,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Anniversary | null;
  partners: string[];
  onClose: () => void;
  onSave: (a: Anniversary) => void;
  onDelete: (a: Anniversary) => void;
}) {
  const t = useT();
  const today = todayStr();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [date, setDate] = useState(
    initial ? occurrenceInYear(initial.monthDay, initial.year ?? parseDate(today).getFullYear()) : today,
  );
  const [noYear, setNoYear] = useState(initial ? initial.year === undefined : false);
  const [kind, setKind] = useState<AnniversaryKind>(initial?.kind ?? "custom");
  const [personName, setPersonName] = useState(initial?.personName ?? "");
  const [milestone, setMilestone] = useState(initial?.milestone ?? false);
  const [note, setNote] = useState(initial?.note ?? "");
  const valid = label.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-[var(--ag-border)] p-3" data-testid="ann-form">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{initial ? t("annFormEdit") : t("annFormNew")}</h4>
        <button type="button" className="rounded-full p-1.5 text-[var(--ag-dim)]" aria-label={t("cancelBtn")} onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <input className={fieldClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("annLabelPh")} aria-label={t("annLabelPh")} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--ag-dim)]">{t("annDateLabel")}</span>
        <input type="date" className={fieldClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{t("annYearUnknown")}</span>
        <Switch checked={noYear} onChange={setNoYear} label={t("annYearUnknown")} />
      </label>
      <div className="flex flex-wrap gap-1.5" role="group">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={cn("ag-chip", kind === k.id && "ag-chip-on")}
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
          >
            {t(k.key)}
          </button>
        ))}
      </div>
      <input
        className={fieldClass}
        value={personName}
        onChange={(e) => setPersonName(e.target.value)}
        placeholder={t("annPersonLabel")}
        aria-label={t("annPersonLabel")}
        list="ann-partners"
      />
      <datalist id="ann-partners">
        {partners.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          {t("annMilestone")}
          <span className="block text-xs text-[var(--ag-dim)]">{t("annMilestoneHint")}</span>
        </span>
        <Switch checked={milestone} onChange={setMilestone} label={t("annMilestone")} />
      </label>
      <input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("annNotePh")} aria-label={t("annNotePh")} />
      <div className="flex items-center gap-2">
        <Button
          variant="save"
          data-testid="ann-save"
          className="flex-1"
          disabled={!valid}
          onClick={() =>
            onSave({
              id: initial?.id ?? newDateId("ann"),
              label: label.trim(),
              monthDay: date.slice(5),
              year: noYear ? undefined : Number(date.slice(0, 4)),
              personName: personName.trim() || undefined,
              kind,
              milestone,
              note: note.trim() || undefined,
              createdAt: initial?.createdAt ?? Date.now(),
            })
          }
        >
          {t("annSave")}
        </Button>
        {initial ? (
          <button type="button" className="ag-chip" onClick={() => onDelete(initial)}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("annDelete")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ChildForm({
  initial,
  onClose,
  onSave,
}: {
  initial: ChildEntry | null;
  onClose: () => void;
  onSave: (c: ChildEntry) => void;
}) {
  const t = useT();
  const today = todayStr();
  const [name, setName] = useState(initial?.name ?? "");
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? "");
  const [refAs, setRefAs] = useState<ChildRef>(initial?.refAs ?? "child");
  const valid = name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(birthdate) && birthdate <= today;
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-[var(--ag-border)] p-3" data-testid="child-form">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{initial ? t("annFormEdit") : t("annChildAdd")}</h4>
        <button type="button" className="rounded-full p-1.5 text-[var(--ag-dim)]" aria-label={t("cancelBtn")} onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("annNamePh")} aria-label={t("annNamePh")} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--ag-dim)]">{t("annBirthdate")}</span>
        <input type="date" className={fieldClass} value={birthdate} max={today} onChange={(e) => setBirthdate(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-1.5" role="group">
        {REFS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={cn("ag-chip", refAs === r.id && "ag-chip-on")}
            aria-pressed={refAs === r.id}
            onClick={() => setRefAs(r.id)}
          >
            {t(r.key)}
          </button>
        ))}
      </div>
      <Button
        variant="save"
        data-testid="child-save"
        className="w-full"
        disabled={!valid}
        onClick={() =>
          onSave({
            id: initial?.id ?? newDateId("kid"),
            name: name.trim(),
            birthdate,
            refAs,
            createdAt: initial?.createdAt ?? Date.now(),
          })
        }
      >
        {t("annSave")}
      </Button>
    </div>
  );
}
