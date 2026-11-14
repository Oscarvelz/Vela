import { Fragment, useRef, useState } from "react";
import { LayoutGrid, List, Plus } from "lucide-react";
import { knownProblem, placeLabel, positionLabel } from "@/lib/vela/catalog";
import { fmtDate, fmtDuration, fmtShort, fmtTime } from "@/lib/vela/dates";
import { spanDays } from "@/lib/vela/encounters";
import { useLang, useT } from "@/lib/vela/i18n";
import { sessionsSorted } from "@/lib/vela/stats";
import { useJournal } from "@/lib/vela/store";
import { trackerForPartner, type CycleTracker } from "@/lib/vela/cycle-trackers";
import type { Encounter, Session } from "@/lib/vela/types";
import { GlanceCard } from "./glance-card";
import { cn } from "@/lib/cn";
import { phaseOn } from "@/lib/vela/cycle";
import { Sparkle } from "./mark";
import { phaseKey } from "./cycle-card";
import { SessionCard } from "./session-card";
import { Card, ConfirmDialog, MenuSelect, RatingIcon, fieldClass } from "./ui";
import { useBackLayer } from "@/lib/vela/back-stack";

export function HistoryView() {
  const t = useT();
  const lang = useLang();
  const sessions = useJournal((s) => s.journal.sessions);
  const encounters = useJournal((s) => s.journal.encounters);
  const partners = useJournal((s) => s.journal.partners);
  const query = useJournal((s) => s.histQ);
  const partner = useJournal((s) => s.histPartner);
  const setQuery = useJournal((s) => s.setHistQ);
  const setPartner = useJournal((s) => s.setHistPartner);
  const layout = useJournal((s) => s.histLayout);
  const showList = useJournal((s) => s.setHistList);
  const cycleGrid = useJournal((s) => s.cycleHistGrid);
  const from = useJournal((s) => s.histFrom);
  const to = useJournal((s) => s.histTo);
  const phase = useJournal((s) => s.histPhase);
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const clearRange = useJournal((s) => s.clearHistRange);
  const [mode, setMode] = useState<"sessions" | "encounters">("sessions");
  // Back / gesture inside History: a search or partner filter clears first, then Encounters returns to
  // Sessions (the tab's root); from there back goes Home.
  useBackLayer(mode === "encounters", () => setMode("sessions"), { tier: 1, name: "history-encounters" });
  useBackLayer(Boolean(query) || Boolean(partner), () => {
    setQuery("");
    setPartner("");
  }, { tier: 2, name: "history-filter" });
  const list = sessionsSorted(sessions);
  const q = query.trim().toLowerCase();
  const filtered = list.filter(
    (session) => inRange(session.date, from, to) && matchesPhase(session, phase, cycles) && matchesSession(session, partner, q, lang),
  );
  const filteredEncounters = encounters
    .slice()
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.createdAt - a.createdAt)
    .filter((encounter) => {
      const inside = list.filter((session) => session.encounterId === encounter.id);
      if (phase && !inside.some((session) => matchesPhase(session, phase, cycles))) return false;
      const spans =
        encounter.startDate <= (to || "9999-12-31") && encounter.endDate >= (from || "0000-01-01");
      if ((from || to) && !spans && !inside.some((session) => inRange(session.date, from, to))) return false;
      if (partner && encounter.partnerName !== partner && !inside.some((session) => session.partnerName === partner)) {
        return false;
      }
      if (!q) return true;
      const hay = [encounter.title, encounter.partnerName, encounter.startDate, encounter.endDate, ...(encounter.problems ?? [])].join(" ").toLowerCase();
      return hay.includes(q) || inside.some((session) => matchesSession(session, "", q, lang));
    });

  return (
    <div className="space-y-4">
      <GlanceCard />
      <input
        type="search"
        className={fieldClass}
        value={query}
        placeholder={t("searchPh")}
        aria-label={t("searchPh")}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="flex gap-2" role="group">
        <button
          type="button"
          className={cn(
            "min-h-10 flex-1 rounded-full border text-sm font-semibold",
            mode === "sessions" ? "border-accent bg-surface-2 text-fg" : "border-border text-dim",
          )}
          onClick={() => setMode("sessions")}
        >
          {t("sessionsTab")}
        </button>
        <button
          type="button"
          className={cn(
            "min-h-10 flex-1 rounded-full border text-sm font-semibold",
            mode === "encounters" ? "border-accent bg-surface-2 text-fg" : "border-border text-dim",
          )}
          onClick={() => setMode("encounters")}
        >
          {t("encountersTab")}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <MenuSelect
          compact
          label={t("filterPartnerAria")}
          value={partner}
          onChange={setPartner}
          options={[
            { value: "", label: t("all") },
            ...filterNames(partners, sessions).map((name) => ({ value: name, label: name })),
          ]}
        />
        <div className="flex shrink-0 gap-1 rounded-xl border border-border bg-black/15 p-1" role="group" aria-label={t("historyGrid")}>
          <button
            type="button"
            aria-pressed={layout === "list"}
            className={cn(
              "flex min-h-9 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold",
              layout === "list" ? "bg-surface-2 text-fg" : "text-dim",
            )}
            onClick={showList}
          >
            <List className="size-3.5" />
            {t("historyList")}
          </button>
          <button
            type="button"
            aria-pressed={layout !== "list"}
            className={cn(
              "flex min-h-9 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold",
              layout !== "list" ? "bg-surface-2 text-fg" : "text-dim",
            )}
            onClick={cycleGrid}
          >
            <LayoutGrid className="size-3.5" />
            {layout === "list" ? t("historyGrid") : layout}
          </button>
        </div>
      </div>
      {phase ? (
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{t(phaseKey(phase === "fertile" ? "fertile" : phase))}</span>
          <button type="button" className="shrink-0 font-semibold text-accent" onClick={clearRange}>
            {t("clearRange")}
          </button>
        </div>
      ) : null}
      {from || to ? (
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {from ? fmtShort(from, lang) : "…"} – {to ? fmtShort(to, lang) : "…"}
          </span>
          <button type="button" className="shrink-0 font-semibold text-accent" onClick={clearRange}>
            {t("clearRange")}
          </button>
        </div>
      ) : null}
      {mode === "sessions" ? (
        <>
          <p className="text-sm leading-relaxed text-dim">
            {layout === "list" ? `${t("historyHintA")} · ` : ""}
            {filtered.length} {t("shown")} · {t("partnersOnFile")}: {partners.length}
          </p>
          {list.length === 0 ? (
            <Empty title={t("noSessionsShow")} body={t("historyEmptyBody")} />
          ) : filtered.length === 0 ? (
            <Empty title={t("noSessionsShow")} body={t("historyFilterEmpty")} />
          ) : (
            <div className={layout === "list" ? "space-y-3" : cn("grid gap-2", layout === 2 ? "grid-cols-2" : layout === 3 ? "grid-cols-3 gap-1.5" : "grid-cols-4 gap-1")}>
              {groupByYear(filtered, (session) => session.date.slice(0, 4) || "—").map((group) => (
                <Fragment key={group.year}>
                  <YearMark year={group.year} />
                  {group.items.map((session) => (
                    <SessionCard key={session.id} session={session} density={layout} />
                  ))}
                </Fragment>
              ))}
            </div>
          )}
        </>
      ) : filteredEncounters.length === 0 ? (
        <Empty title={t("noEncounters")} body={t("noEncountersBody")} />
      ) : (
        <div className={layout === "list" ? "space-y-3" : cn("grid gap-2", layout === 2 ? "grid-cols-2" : layout === 3 ? "grid-cols-3 gap-1.5" : "grid-cols-4 gap-1")}>
          {groupEncounters(filteredEncounters).map((group) => (
            <Fragment key={group.year}>
              <YearMark year={group.year} />
              {group.items.map((encounter) => (
                <EncounterReport key={encounter.id} encounter={encounter} sessions={list} density={layout} />
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function yearsTouched(start: string, end: string) {
  const from = Number((start || end).slice(0, 4));
  const to = Number((end || start).slice(0, 4));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return ["—"];
  const years: string[] = [];
  for (let year = Math.max(from, to); year >= Math.min(from, to); year -= 1) years.push(String(year));
  return years;
}

function groupEncounters(items: Encounter[]) {
  const map = new Map<string, Encounter[]>();
  for (const item of items) {
    for (const year of yearsTouched(item.startDate, item.endDate)) {
      const rows = map.get(year);
      if (rows) rows.push(item);
      else map.set(year, [item]);
    }
  }
  return [...map.keys()].sort((a, b) => b.localeCompare(a)).map((year) => ({ year, items: map.get(year) ?? [] }));
}

function groupByYear<T>(items: T[], yearOf: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const year = yearOf(item);
    const rows = map.get(year);
    if (rows) rows.push(item);
    else map.set(year, [item]);
  }
  return [...map.keys()].sort((a, b) => b.localeCompare(a)).map((year) => ({ year, items: map.get(year) ?? [] }));
}

function YearMark({ year }: { year: string }) {
  return (
    <div className="col-span-full flex items-center gap-3 pt-1">
      <span className="font-display text-xl tracking-wide text-accent">{year}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Each session is judged against its own tracker: its partner's cycle, else the user's own (see trackerForPartner). */
function matchesPhase(session: { date: string; partnerName: string }, phase: "" | "period" | "fertile" | "ovulation" | "quiet", cycles: CycleTracker[]) {
  if (!phase) return true;
  const cycle = trackerForPartner(cycles, session.partnerName);
  if (!cycle) return false;
  const date = session.date;
  const first = [...cycle.starts].sort()[0];
  if (!cycle.enabled || !first || date < first) return false;
  const found = phaseOn(cycle, date);
  // Exact since 2.1.20: ovulation has its own row in the statistics, so each phase filter
  // shows exactly the days its count names (fertile used to fold ovulation in, back when
  // no surface could name ovulation on its own).
  return found === phase;
}

function inRange(date: string, from: string, to: string) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function matchesSession(session: Session, partner: string, q: string, lang: ReturnType<typeof useLang>) {
  if (partner && (session.partnerName || "") !== partner) return false;
  if (!q) return true;
  const hay = [
    session.partnerName,
    placeLabel(lang, session.place),
    session.place,
    session.positions.map((item) => positionLabel(lang, item)).join(" "),
    session.notes,
    session.ownWords,
    (session.problems ?? []).join(" "),
    session.date,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Card className="ag-glass py-10 text-center">
      <Sparkle className="mx-auto size-7 text-fg" />
      <h2 className="mt-4 font-display text-3xl">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-dim">{body}</p>
    </Card>
  );
}

function EncounterReport({
  encounter,
  sessions,
  density = "list",
}: {
  encounter: Encounter;
  sessions: Session[];
  density?: "list" | 2 | 3 | 4;
}) {
  const t = useT();
  const lang = useLang();
  const style = useJournal((s) => s.journal.settings.ratingStyle);
  const openEdit = useJournal((s) => s.openEdit);
  const begin = useJournal((s) => s.beginSession);
  const remove = useJournal((s) => s.removeEncounter);
  const [askRemove, setAskRemove] = useState(false);
  const [askAdd, setAskAdd] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [openSwipe, setOpenSwipe] = useState(false);
  const [drag, setDrag] = useState(0);
  useBackLayer(openSwipe, () => { setOpenSwipe(false); setDrag(0); }, { name: "card-actions" });
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef(0);
  const rows = sessions.filter((session) => session.encounterId === encounter.id);
  const days = spanDays(encounter.startDate, encounter.endDate);
  const names = [...new Set([encounter.partnerName, ...rows.map((session) => session.partnerName)].filter(Boolean))];
  const title = encounter.title.trim() || (names[0] ? (lang === "es" ? `Con ${names[0]}` : `With ${names[0]}`) : t("encounter"));
  const latest = [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))[0];
  const roomy = density === "list" || density === 2;

  const face = (
    <>
      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setShowSessions((value) => !value)}>
          <h2 className={cn("font-display leading-tight", density === 4 ? "text-[11px]" : density === 3 ? "text-sm" : density === 2 ? "text-lg" : "text-2xl")}>
            {title}
          </h2>
          <p className={cn("mt-1 text-dim", density === "list" ? "text-sm" : "text-[10px] leading-tight")}>
            {encounter.startDate === encounter.endDate
              ? fmtShort(encounter.startDate, lang)
              : `${fmtShort(encounter.startDate, lang)} – ${fmtShort(encounter.endDate, lang)}`}
            {density === "list"
              ? ` · ${rows.length} ${rows.length === 1 ? t("sessionWord") : t("sessionsWord")} · ${days} ${days === 1 ? t("day") : t("days")}`
              : ` · ${rows.length}`}
          </p>
        </button>
        {roomy ? (
          <button
            type="button"
            aria-label={t("addSession")}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/40 text-accent"
            onClick={() => setAskAdd(true)}
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {density === "list" && names.length > 0 ? (
        <p className="mt-1 text-sm">{lang === "es" ? "Con" : "With"} {names.join(", ")}</p>
      ) : null}
      {density === "list" && encounter.comment ? <p className="mt-2 text-sm leading-relaxed">{encounter.comment}</p> : null}
      {(encounter.problems ?? []).length > 0 && density !== 4 ? (
        <p className={cn("mt-2 flex flex-wrap gap-1.5 text-dim", density === "list" ? "text-sm" : "text-[10px]")}>
          {(encounter.problems ?? []).map((id) => (
            <span key={id} className="rounded-full border border-border px-2 py-0.5">
              {knownProblem(id) ? t(knownProblem(id)!) : id}
            </span>
          ))}
        </p>
      ) : null}
      {density === 2 && encounter.comment ? <p className="mt-1 line-clamp-3 text-[11px] leading-snug">{encounter.comment}</p> : null}
      {showSessions && roomy ? (
        <div className="mt-3 divide-y divide-border">
          {rows.map((session) => (
            <button
              key={session.id}
              type="button"
              className="flex w-full items-start gap-3 py-3 text-left"
              onClick={() => openEdit(session.id)}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block font-semibold", density === 2 && "text-[11px]")}>
                  <span className="text-accent">{fmtDate(session.date, lang)}</span>
                  <span className="font-medium text-dim"> · {fmtTime(session.time, lang)}</span>
                </span>
                <span className={cn("mt-0.5 block text-dim", density === 2 ? "text-[10px]" : "text-sm")}>
                  {session.durationMins ? `${fmtDuration(session.durationMins)} · ` : ""}
                  {t("sessionThatDay")} {session.sessionNumber} {t("thatDay")} · {placeLabel(lang, session.place)}
                </span>
              </span>
              <span className="flex shrink-0" aria-hidden>
                {[1, 2, 3, 4, 5].map((level) => (
                  <RatingIcon key={level} style={style} className="size-3.5" active={session.overall >= level} />
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <ConfirmDialog
        open={askAdd}
        title={t("addRoundQ")}
        name={title}
        confirmLabel={t("yesAddRound")}
        cancelLabel={t("keep")}
        confirmTone="primary"
        onCancel={() => setAskAdd(false)}
        onConfirm={() => {
          setAskAdd(false);
          begin(encounter.id);
        }}
      />
      <ConfirmDialog
        open={askRemove}
        title={t("confirmRemoveQ")}
        name={`${title} · ${rows.length} ${rows.length === 1 ? t("sessionWord") : t("sessionsWord")}`}
        confirmLabel={t("yesDelete")}
        cancelLabel={t("keep")}
        onCancel={() => setAskRemove(false)}
        onConfirm={() => {
          remove(encounter.id);
          setAskRemove(false);
        }}
      />
    </>
  );

  if (!roomy) {
    return (
      <Card className={`ag-glass ${density === 4 ? "p-1.5" : "p-2"}`}>
        {face}
      </Card>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-card" data-noswipe>
      <div className="absolute inset-y-0 right-0 flex w-32">
        <button
          type="button"
          className="flex-1 bg-surface-2 text-xs font-semibold"
          onClick={() => {
            setOpenSwipe(false);
            if (latest) openEdit(latest.id);
          }}
        >
          {t("edit")}
        </button>
        <button
          type="button"
          className="flex-1 bg-wine text-xs font-semibold text-fg"
          onClick={() => {
            setOpenSwipe(false);
            setAskRemove(true);
          }}
        >
          {t("delete")}
        </button>
      </div>
      <article
        className={cn("ag-panel relative rounded-card border border-border p-4 transition-transform", density === 2 && "p-2.5", openSwipe && "-translate-x-32")}
        style={drag ? { transform: `translateX(${drag}px)` } : undefined}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          start.current = { x: touch.clientX, y: touch.clientY };
          setDrag(0);
        }}
        onTouchMove={(event) => {
          if (!start.current) return;
          const touch = event.touches[0];
          const dx = touch.clientX - start.current.x;
          const dy = touch.clientY - start.current.y;
          if (Math.abs(dy) > Math.abs(dx)) return;
          const base = openSwipe ? -128 : 0;
          const next = Math.max(-128, Math.min(0, base + dx));
          dragRef.current = next;
          setDrag(next);
        }}
        onTouchEnd={() => {
          if (dragRef.current < -48) setOpenSwipe(true);
          else setOpenSwipe(false);
          dragRef.current = 0;
          setDrag(0);
          start.current = null;
        }}
      >
        {face}
      </article>
    </div>
  );
}

/** Partner filter: names on file first, then names that only live on sessions (e.g. a removed partner). */
function filterNames(partners: string[], sessions: { partnerName: string }[]) {
  const seen = new Set(partners.map((name) => name.trim().toLocaleLowerCase()));
  const out = partners.slice();
  for (const session of sessions) {
    const key = session.partnerName.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(session.partnerName.trim());
  }
  return out;
}
