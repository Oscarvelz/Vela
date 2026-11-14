import type { ReactNode } from "react";
import { knownMethod, knownProblem, placeLabel, positionLabel } from "@/lib/vela/catalog";
import type { CopyKey } from "@/lib/vela/copy";
import { fill } from "@/lib/vela/cycle-words";
import { fmtDate, fmtDuration, localeOf, addDays, startOfWeek, todayStr } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import {
  comparisonBars,
  firstOccurrences,
  longestStreak,
  monthCount,
  sessionsSorted,
  spansIn,
  timeBuckets,
  topCounts,
  weekCount,
  weekdayCounts,
  yearCount,
} from "@/lib/vela/stats";
import { useJournal } from "@/lib/vela/store";
import { Sparkle } from "./mark";
import { CycleStats } from "./cycle-card";
import { Card, RatingIcon } from "./ui";
import { cn } from "@/lib/cn";

export function InsightsView() {
  const t = useT();
  const lang = useLang();
  const sessions = useJournal((s) => s.journal.sessions);
  const encounters = useJournal((s) => s.journal.encounters);
  const weekStart = useJournal((s) => s.journal.settings.weekStart);
  const ratingStyle = useJournal((s) => s.journal.settings.ratingStyle);
  const compare = useJournal((s) => s.compare);
  const setCompare = useJournal((s) => s.setCompare);
  const openRange = useJournal((s) => s.openHistRange);
  const list = sessionsSorted(sessions);

  if (list.length === 0) {
    return (
      <Card className="ag-glass px-6 py-12 text-center">
        <Sparkle className="mx-auto size-8 text-fg" />
        <h2 className="mt-5 font-display text-4xl leading-tight">{t("insightsEmptyTitle")}</h2>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-dim">{t("insightsEmptyBody")}</p>
      </Card>
    );
  }

  const total = list.length;
  const streak = longestStreak(list);
  const avgGlow = list.reduce((sum, session) => sum + (session.overall || 0), 0) / total;
  const avgDur = Math.round(list.reduce((sum, session) => sum + (session.durationMins || 0), 0) / total);
  const activeDays = new Set(list.map((session) => session.date)).size;
  const bars = comparisonBars(list, compare, weekStart, lang, encounters);
  const weekStartDay = startOfWeek(todayStr(), weekStart);
  const monthStart = `${todayStr().slice(0, 7)}-01`;
  const yearStart = `${todayStr().slice(0, 4)}-01-01`;
  const encountersNow = {
    week: spansIn(encounters, weekStartDay, addDays(weekStartDay, 6)),
    month: spansIn(encounters, monthStart, addDays(addDays(monthStart, 32).slice(0, 7) + "-01", -1)),
    year: spansIn(encounters, yearStart, `${todayStr().slice(0, 4)}-12-31`),
  };
  const weekdays = weekdayCounts(list);
  const bestWd = weekdays.indexOf(Math.max(...weekdays));
  const wdNameRaw = new Date(2024, 0, 7 + bestWd).toLocaleDateString(localeOf(lang), { weekday: "long" });
  const wdName = wdNameRaw.charAt(0).toUpperCase() + wdNameRaw.slice(1);
  const buckets = timeBuckets(list);
  const bucketNames = [t("bucketLateNight"), t("bucketMorning"), t("bucketAfternoon"), t("bucketEvening")];
  const bestBucket = buckets.indexOf(Math.max(...buckets));
  // The heading names the slot in a word so it fits one line; the meters below keep the hours.
  const bucketShort = [t("bucketShortLateNight"), t("bucketShortMorning"), t("bucketShortAfternoon"), t("bucketShortEvening")];
  const monthMap = new Map<string, number>();
  for (const session of list) {
    const key = session.date.slice(0, 7);
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const bestMonth = Array.from(monthMap.entries()).sort((a, b) => b[1] - a[1])[0];
  const bestMonthName = bestMonth
    ? new Date(Number(bestMonth[0].slice(0, 4)), Number(bestMonth[0].slice(5, 7)) - 1, 1).toLocaleDateString(
        localeOf(lang),
        { month: "long", year: "numeric" },
      )
    : "";
  const partners = topCounts(list.map((session) => session.partnerName || "—solo—"));
  const places = topCounts(list.map((session) => session.place));
  const positions = topCounts(list.flatMap((session) => session.positions));
  // Problems and contraception are recorded on every session; the statistics now read them too (Oscar, Nov 14 2026).
  const problemRows = topCounts(list.flatMap((session) => session.problems));
  const problemSessions = list.filter((session) => session.problems.length).length;
  const methodRows = topCounts(list.flatMap((session) => session.contraception));
  const problemLabel = (id: string) => {
    const key = knownProblem(id);
    return key ? t(key as CopyKey) : id;
  };
  const methodLabel = (id: string) => {
    const key = knownMethod(id);
    return key ? t(key as CopyKey) : id;
  };
  // A row is a window onto the history: tapping it opens History across the dates that carry it.
  const spanOf = (rows: typeof list) => {
    const dates = rows.map((row) => row.date).sort();
    return dates.length ? ([dates[0], dates[dates.length - 1]] as const) : null;
  };
  // Positions whose first appearance in the whole history is recent — the journal's new territory.
  const newPositions = Array.from(firstOccurrences(list).entries())
    .filter(([, session]) => session.date >= addDays(todayStr(), -30))
    .sort((a, b) => b[1].date.localeCompare(a[1].date));

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="grid grid-cols-3 gap-2">
        <Stat value={String(total)} label={t(total === 1 ? "sessionWord" : "sessionsWord")} />
        <Stat value={String(encounters.length)} label={t(encounters.length === 1 ? "encounterWord" : "encountersWord")} />
        <Stat value={String(streak)} label={t("streakShort")} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Period
          label={t("periodWeek")}
          sessions={weekCount(list, weekStart)}
          encounters={encountersNow.week}
          sessionLabel={t("sessionWord")}
          sessionsLabel={t("sessionsWord")}
          encounterLabel={t("encounterWord")}
          encountersLabel={t("encountersWord")}
        />
        <Period
          label={t("periodMonth")}
          sessions={monthCount(list)}
          encounters={encountersNow.month}
          sessionLabel={t("sessionWord")}
          sessionsLabel={t("sessionsWord")}
          encounterLabel={t("encounterWord")}
          encountersLabel={t("encountersWord")}
        />
        <Period
          label={t("periodYear")}
          sessions={yearCount(list)}
          encounters={encountersNow.year}
          sessionLabel={t("sessionWord")}
          sessionsLabel={t("sessionsWord")}
          encounterLabel={t("encounterWord")}
          encountersLabel={t("encountersWord")}
        />
      </div>
      <CycleStats />
      <Card className="ag-glass min-w-0 overflow-hidden">
        <h2 className="font-display text-2xl">{t("avgGlowLength")}</h2>
        <p className="mt-2 flex items-center gap-2 text-base">
          <RatingIcon style={ratingStyle} className="size-4" />
          <b className="tabular-nums">{avgGlow.toFixed(1)}</b> {t("avg")} · <b className="tabular-nums">{fmtDuration(avgDur)}</b>{" "}
          {t("avg")}
        </p>
      </Card>
      <Card className="ag-glass ag-aurora min-w-0 overflow-hidden">
        <h2 className="font-display text-2xl">{t("compareOverTime")}</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group">
          {(["weeks", "months", "years"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCompare(mode)}
              className={cn(
                "min-h-10 rounded-full border px-4 text-sm font-semibold capitalize",
                compare === mode ? "border-accent bg-surface-2 text-fg" : "border-border bg-transparent text-dim",
              )}
            >
              {t(mode)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-dim">
          <span className="text-fg">{t("sessionsWord")}</span>
          {" · "}
          <span className="text-accent">{t("encountersWord")}</span>
        </p>
        <div className="mt-3 flex h-44 items-end gap-1 overflow-hidden">
          {bars.map((bar, index) => (
            <button
              key={`${bar.label}-${index}`}
              type="button"
              className="flex h-full w-0 min-w-0 flex-1 flex-col items-center justify-end gap-1 overflow-hidden rounded-lg active:opacity-70"
              aria-label={`${bar.label} ${bar.n} ${t("sessionsWord")} ${bar.encounters} ${t("encountersWord")}`}
              onClick={() => openRange(bar.from, bar.to)}
            >
              <span className="text-xs font-semibold tabular-nums leading-none">{bar.n}</span>
              <span className="text-[10px] font-semibold tabular-nums leading-none text-accent">{bar.encounters}</span>
              <div
                className="ag-liquid-col w-full max-w-9 rounded-t-[10px] rounded-b-[4px]"
                style={{ height: `${Math.max(8, Math.round((bar.n / Math.max(1, ...bars.map((item) => item.n))) * 96))}px` }}
              />
              <span className="w-full truncate text-center text-[10px] leading-none text-dim">{bar.label}</span>
            </button>
          ))}
        </div>
        {bars.length > 0 ? (
          <button
            type="button"
            className="mt-4 text-left text-sm leading-relaxed text-dim active:opacity-70"
            onClick={() => {
              const dates = list.map((session) => session.date).sort();
              if (dates.length) openRange(dates[0], dates[dates.length - 1]);
            }}
          >
            {t("howOftenA")} {activeDays} {t("activeDaysW")} ·{" "}
            <b className="text-fg">{activeDays ? (total / activeDays).toFixed(1) : "0"}</b> {t("aboutPerDay")} ·{" "}
            <b className="text-accent">{encounters.length}</b> {t(encounters.length === 1 ? "encounterWord" : "encountersWord")}. {t("averagesLive")}
          </button>
        ) : null}
      </Card>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="ag-glass min-w-0 overflow-hidden">
          <h2 className="font-display text-2xl leading-tight break-words">
            {t("busiestDay")}: <span className="text-accent">{wdName}</span>
          </h2>
          <div className="mt-3">
            {weekdays.map((count, index) => (
              <Meter
                key={index}
                label={new Date(2024, 0, 7 + index).toLocaleDateString(localeOf(lang), { weekday: "short" })}
                value={count}
                max={Math.max(1, ...weekdays)}
              />
            ))}
          </div>
        </Card>
        <Card className="ag-glass min-w-0 overflow-hidden">
          <h2 className="font-display text-2xl leading-tight break-words">
            {t("timeOfDayShort")}: <span className="text-accent">{bucketShort[bestBucket]}</span>
          </h2>
          <div className="mt-3">
            {bucketNames.map((name, index) => (
              <Meter key={name} label={name} value={buckets[index]} max={Math.max(1, ...buckets)} />
            ))}
          </div>
        </Card>
        <Card className="ag-glass min-w-0 overflow-hidden">
          <h2 className="font-display text-2xl">{t("withWhomPartner")}</h2>
          <div className="mt-3">
            {partners.map(([name, count]) => {
              const solo = name === "—solo—";
              const label = solo ? t("soloMoment") : name;
              const rows = list.filter((session) => (session.partnerName || "—solo—") === name);
              const avg = rows.reduce((sum, session) => sum + (session.overall || 0), 0) / rows.length;
              return (
                <Meter
                  key={name}
                  label={label}
                  value={count}
                  max={Math.max(1, ...partners.map((row) => row[1]))}
                  sub={`${t("last")}: ${rows[0] ? fmtDate(rows[0].date, lang) : ""} · ${t("avg")} ${avg.toFixed(1)}`}
                />
              );
            })}
          </div>
        </Card>
        <Card className="ag-glass min-w-0 overflow-hidden">
          <h2 className="font-display text-2xl">{t("byPlace")}</h2>
          <div className="mt-3">
            {places.map(([name, count]) => (
              <Meter
                key={name}
                label={placeLabel(lang, name)}
                value={count}
                max={Math.max(1, ...places.map((row) => row[1]))}
              />
            ))}
          </div>
        </Card>
        <Card className="ag-glass min-w-0 overflow-hidden">
          <h2 className="font-display text-2xl">{t("byPosition")}</h2>
          <div className="mt-3">
            {positions.length === 0 ? (
              <p className="text-sm text-dim">{t("noPositionsYet")}</p>
            ) : (
              positions.map(([name, count]) => {
                const rows = list.filter((session) => session.positions.includes(name));
                const avg = rows.reduce((sum, session) => sum + (session.overall || 0), 0) / (rows.length || 1);
                return (
                  <Meter
                    key={name}
                    label={positionLabel(lang, name)}
                    value={count}
                    max={Math.max(1, ...positions.map((row) => row[1]))}
                    aside={
                      <span className="inline-flex items-center gap-1">
                        {count} · {t("avg")} {avg.toFixed(1)}
                        <RatingIcon style={ratingStyle} className="size-3.5" />
                      </span>
                    }
                  />
                );
              })
            )}
          </div>
        </Card>
        {problemRows.length ? (
          <Card className="ag-glass min-w-0 overflow-hidden">
            <h2 className="font-display text-2xl">{t("problemsTitle")}</h2>
            <p className="mt-2 text-sm text-dim">{fill(t("probShare"), { n: problemSessions, total })}</p>
            <div className="mt-3">
              {problemRows.map(([id, count]) => {
                const rows = list.filter((session) => session.problems.includes(id));
                const span = spanOf(rows);
                return (
                  <Meter
                    key={id}
                    label={problemLabel(id)}
                    value={count}
                    max={Math.max(1, ...problemRows.map((row) => row[1]))}
                    sub={`${t("last")}: ${rows[0] ? fmtDate(rows[0].date, lang) : ""}`}
                    onTap={span ? () => openRange(span[0], span[1]) : undefined}
                  />
                );
              })}
            </div>
          </Card>
        ) : null}
        {methodRows.length ? (
          <Card className="ag-glass min-w-0 overflow-hidden">
            <h2 className="font-display text-2xl">{t("contraception")}</h2>
            <div className="mt-3">
              {methodRows.map(([id, count]) => {
                const rows = list.filter((session) => session.contraception.includes(id));
                const avg = rows.reduce((sum, session) => sum + (session.overall || 0), 0) / (rows.length || 1);
                const span = spanOf(rows);
                return (
                  <Meter
                    key={id}
                    label={methodLabel(id)}
                    value={count}
                    max={Math.max(1, ...methodRows.map((row) => row[1]))}
                    aside={
                      <span className="inline-flex items-center gap-1">
                        {count} · {t("avg")} {avg.toFixed(1)}
                        <RatingIcon style={ratingStyle} className="size-3.5" />
                      </span>
                    }
                    onTap={span ? () => openRange(span[0], span[1]) : undefined}
                  />
                );
              })}
            </div>
          </Card>
        ) : null}
        {newPositions.length ? (
          <Card className="ag-glass min-w-0 overflow-hidden">
            <h2 className="font-display text-2xl">{t("insNewPositions")}</h2>
            <div className="mt-3 space-y-3">
              {newPositions.map(([name, session]) => (
                <button
                  key={name}
                  type="button"
                  className="block w-full text-left active:opacity-70"
                  onClick={() => openRange(session.date, session.date)}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-base font-semibold">{positionLabel(lang, name)}</span>
                    <span className="shrink-0 text-sm font-medium text-accent">{t("insFirstTime")}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-dim">
                    {fmtDate(session.date, lang)}
                    {session.partnerName ? ` · ${session.partnerName}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        ) : null}
        <Card className="ag-glass ag-aurora min-w-0 overflow-hidden">
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Sparkle className="size-4 text-accent" />
            {t("yourStory")}
          </h2>
          <div className="mt-4 space-y-3">
            {bestMonth ? (
              <StoryLine>
                {t("funMonthA")} <b>{bestMonthName}</b> — {bestMonth[1]}{" "}
                {bestMonth[1] === 1 ? t("sessionWord") : t("sessionsWord")} {t("funMonthB")}
              </StoryLine>
            ) : null}
            <StoryLine>
              {wdName} {t("funWeekdayA")} — {weekdays[bestWd]} {t("funWeekdayOf")} {wdName}.
            </StoryLine>
            <StoryLine>
              {t("funPrimeA")} <b>{bucketNames[bestBucket]}</b> {t("funPrimeB")}
            </StoryLine>
            {streak > 0 ? (
              <StoryLine>
                {t("funStreakA")} <b>{streak}</b> {t("funStreakB")}
              </StoryLine>
            ) : null}
            <StoryLine>
              {t("funAvgA")} <b>{avgGlow.toFixed(1)}</b> {t("funAvgB")}
            </StoryLine>
            {problemSessions ? (
              <StoryLine>
                {fill(t("storyProblem"), {
                  n: problemSessions,
                  total,
                  top: problemLabel(problemRows[0][0]).replace(/^./, (c) => c.toLowerCase()),
                })}
              </StoryLine>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-border bg-surface-2 px-2 py-3 text-center">
      <b className="block truncate font-display text-3xl tabular-nums leading-none text-accent">{value}</b>
      <span className="mt-1.5 block truncate text-[11px] capitalize text-dim">{label}</span>
    </div>
  );
}

function Period({
  label,
  sessions,
  encounters,
  sessionLabel,
  sessionsLabel,
  encounterLabel,
  encountersLabel,
}: {
  label: string;
  sessions: number;
  encounters: number;
  sessionLabel: string;
  sessionsLabel: string;
  encounterLabel: string;
  encountersLabel: string;
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-border bg-surface-2 px-2 py-3 text-center">
      <p className="truncate text-[11px] font-semibold text-dim">{label}</p>
      <p className="mt-2 font-display text-2xl tabular-nums leading-none">{sessions}</p>
      <p className="mt-1 truncate text-[10px] text-dim">{sessions === 1 ? sessionLabel : sessionsLabel}</p>
      <p className="mt-2 font-display text-2xl tabular-nums leading-none text-accent">{encounters}</p>
      <p className="mt-1 truncate text-[10px] text-dim">{encounters === 1 ? encounterLabel : encountersLabel}</p>
    </div>
  );
}

function StoryLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2.5 text-sm leading-relaxed">
      <Sparkle className="mt-1 size-3 shrink-0 text-accent" />
      <span>{children}</span>
    </p>
  );
}

function Meter({
  label,
  value,
  max,
  sub,
  aside,
  onTap,
}: {
  label: string;
  value: number;
  max: number;
  sub?: string;
  aside?: ReactNode;
  onTap?: () => void;
}) {
  const width = Math.max(value > 0 ? 8 : 0, Math.round((value / max) * 100));
  const inner = (
    <>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-base font-semibold">{label}</span>
        <span className="shrink-0 text-sm text-dim tabular-nums">{aside ?? value}</span>
      </div>
      <div className="h-2.5 w-full max-w-full overflow-hidden rounded-full bg-surface-2">
        <div className="ag-liquid h-full max-w-full rounded-full" style={{ width: `${width}%` }} />
      </div>
      {sub ? <p className="mt-1 text-xs text-dim">{sub}</p> : null}
    </>
  );
  if (onTap) {
    return (
      <button type="button" onClick={onTap} className="mb-4 block w-full min-w-0 max-w-full text-left active:opacity-70">
        {inner}
      </button>
    );
  }
  return <div className="mb-4 min-w-0 max-w-full">{inner}</div>;
}
