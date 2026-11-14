/* The Advisor card (2.1.22) — the top of Insights. One aurora card, one voice:
   the days ahead for every person followed, the last time read back whole, the steps
   the journal's own patterns suggest, and one fact worth knowing. Every line carries
   its evidence; a section with nothing true to say does not render. The statistics
   below are its receipts — the reading comes from lib/vela/advisor.ts and nowhere else. */
import { useMemo } from "react";
import { knownMethod, knownProblem, placeLabel, positionLabel } from "@/lib/vela/catalog";
import type { CopyKey } from "@/lib/vela/copy";
import { fill, trackerLabel } from "@/lib/vela/cycle-words";
import { fmtDate, fmtDuration, fmtShort, todayStr } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { readAdvisor, type AdvisorLine } from "@/lib/vela/advisor";
import { hiddenIn, upcomingDates, type UpcomingDate } from "@/lib/vela/anniversaries";
import { partnerPerson } from "@/lib/vela/people";
import { QUIET_REASON_KEY } from "./quiet-sheet";
import { REASON_KEY } from "./cycle-reason";
import { useJournal } from "@/lib/vela/store";
import { Sparkle } from "./mark";
import { phaseKey } from "./cycle-card";
import { Card, RatingIcon } from "./ui";

const BUCKET_KEYS: CopyKey[] = ["bucketShortLateNight", "bucketShortMorning", "bucketShortAfternoon", "bucketShortEvening"];
const lc = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

function Subhead({ children }: { children: string }) {
  return <p className="mt-5 text-sm font-semibold first:mt-4">{children}</p>;
}

function DialRow({ label, value, style }: { label: string; value: number; style: "flame" | "star" | "heart" }) {
  if (value <= 0) return null;
  return (
    <span className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs text-dim">{label}</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((level) => (
          <RatingIcon key={level} style={style} className="size-3.5" active={value >= level} />
        ))}
      </span>
    </span>
  );
}

export function AdvisorCard() {
  const t = useT();
  const lang = useLang();
  const allSessions = useJournal((s) => s.journal.sessions);
  const allCycles = useJournal((s) => s.journal.settings.cycles);
  const archivedPeople = useJournal((s) => s.journal.settings.archivedPeople);
  const ratingStyle = useJournal((s) => s.journal.settings.ratingStyle);
  const openRange = useJournal((s) => s.openHistRange);
  const selectCycle = useJournal((s) => s.selectCycle);
  const setCycleSheet = useJournal((s) => s.setCycleSheet);
  // The Archive law: the Advisor reads only what the user lets it count.
  const sessions = allSessions.filter((s) => !hiddenIn(archivedPeople, s.partnerName, "stats"));
  const cycles = allCycles.filter(
    (tr) =>
      !(tr.partnerName && hiddenIn(archivedPeople, tr.partnerName, "stats")) &&
      !(tr.partnerLink && hiddenIn(archivedPeople, tr.partnerLink, "stats")),
  );
  const anniversariesRaw = useJournal((s) => s.journal.settings.anniversaries);
  const childrenRaw = useJournal((s) => s.journal.settings.children);
  const upcoming = useMemo(
    () => upcomingDates({ anniversaries: anniversariesRaw, children: childrenRaw, archivedPeople }, todayStr()),
    [anniversariesRaw, childrenRaw, archivedPeople],
  );
  const coupleMode = useJournal((s) => s.journal.settings.coupleMode);
  const peopleList = useJournal((s) => s.journal.people);
  const quietMarks = useJournal((s) => s.journal.quietDays);
  const partner = partnerPerson(peopleList);
  const reading = useMemo(
    () => readAdvisor(sessions, cycles, todayStr(), upcoming, coupleMode && partner ? { partnerName: partner.name } : undefined, quietMarks ?? []),
    [sessions, cycles, upcoming, coupleMode, partner, quietMarks],
  );

  /* The Advisor's voice for the dates (2.1.25): it congratulates the time,
     never the quality of the years, and it always uses the person's name —
     never a word that presumes the relationship. */
  const dateText = (u: UpcomingDate): string => {
    if (u.source === "birthday") {
      if (u.daysUntil === 0) return fill(t("advBdayToday"), { name: u.label, age: u.turning ?? "" });
      if (u.daysUntil === 1) return fill(t("advBdayTomorrow"), { name: u.label, age: u.turning ?? "" });
      return fill(t("advBdaySoon"), { name: u.label, age: u.turning ?? "", n: u.daysUntil });
    }
    const withName = (base: string) => (u.personName && !u.label.includes(u.personName) ? `${base} · ${u.personName}` : base);
    if (u.daysUntil === 0) {
      let base: string;
      if (u.turning && u.turning >= 1) {
        if (u.kind === "married") base = u.personName ? fill(t("advAnnMarried"), { n: u.turning, name: u.personName }) : fill(t("advAnnMarriedSolo"), { n: u.turning });
        else if (u.kind === "met") base = u.personName ? fill(t("advAnnMet"), { n: u.turning, name: u.personName }) : fill(t("advAnnMetSolo"), { n: u.turning });
        else if (u.kind === "first") base = u.personName ? fill(t("advAnnFirst"), { n: u.turning, name: u.personName }) : fill(t("advAnnFirstSolo"), { n: u.turning });
        else base = fill(t("advAnnCustomYears"), { label: u.label, n: u.turning });
      } else {
        base = withName(fill(t("advDateToday"), { label: u.label }));
      }
      return u.milestone ? `${base} ${t("advCongrats")}` : base;
    }
    if (u.daysUntil === 1) return withName(fill(t("advDateTomorrow"), { label: u.label }));
    return withName(fill(t("advDateSoon"), { label: u.label, n: u.daysUntil }));
  };

  const problemLabel = (id: string) => {
    const known = knownProblem(id);
    return known ? t(known) : id;
  };
  const methodLabel = (id: string) => {
    const known = knownMethod(id);
    return known ? t(known) : id;
  };
  const lineText = (line: AdvisorLine): string => {
    switch (line.kind) {
      case "problemBucket":
        return fill(t("advProblemBucket"), { problem: problemLabel(line.problem), bucket: lc(t(BUCKET_KEYS[line.bucket])), n: line.n, m: line.m });
      case "bestShare": {
        const value =
          line.via === "position" ? positionLabel(lang, line.value) : line.via === "place" ? placeLabel(lang, line.value) : lc(t(BUCKET_KEYS[line.bucket]));
        return fill(t("advBestShare"), { value, n: line.n, m: line.m });
      }
      case "phaseBest":
        return fill(t("advPhaseBest"), { name: line.name, phase: lc(t(phaseKey(line.phase))), avg: line.avg.toFixed(1), n: line.n });
      case "rhythm":
        return fill(t("advRhythm"), { n: line.since, m: line.usual });
      case "explained":
        return fill(t("advExplained"), {
          n: line.days,
          cause: line.reason === "custom" ? (line.custom ?? "") : t(QUIET_REASON_KEY[line.reason]),
        });
      case "cycleNote": {
        const note = line.reasonId === "other" ? (line.noteText ?? "") : t(REASON_KEY[line.reasonId]);
        if (line.self) {
          return line.low < line.high
            ? fill(t("advCyNoteRange"), { n: line.days, a: line.low, b: line.high, note })
            : fill(t("advCyNoteOne"), { n: line.days, u: line.low, note });
        }
        return line.low < line.high
          ? fill(t("advCyNoteRangeP"), { name: line.name, n: line.days, a: line.low, b: line.high, note })
          : fill(t("advCyNoteOneP"), { name: line.name, n: line.days, u: line.low, note });
      }
      case "cycleProjected":
        return t("advCyProjected");
      case "methodNote":
        return fill(t("advMethodNote"), { method: methodLabel(line.method), avg: line.avg.toFixed(1), n: line.n });
    }
  };

  const { people, last, lines, fact, basis, dates, voices } = reading;
  if (!people.length && !last && !lines.length && !fact && !dates.today.length && !dates.soon.length && !voices) return null;
  // A date that is today is the day's news: the rotating fact stands down.
  const shownFact = dates.today.length ? null : fact;
  const lastSession = last?.session;

  return (
    <Card className="ag-aurora min-w-0 overflow-hidden" data-testid="advisor-card">
      <div className="flex items-center gap-2">
        <Sparkle className="size-5 shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 truncate font-display text-2xl">{t("advTitle")}</h2>
      </div>
      <p className="mt-1 text-xs text-dim">{basis.cycles === 1 ? fill(t("advBasisOne"), { n: basis.sessions }) : fill(t("advBasis"), { n: basis.sessions, m: basis.cycles })}</p>

      {dates.today.length ? (
        <>
          <Subhead>{t("todayBtn")}</Subhead>
          <div className="mt-2 space-y-2" data-testid="advisor-dates-today">
            {dates.today.map((u) => (
              <p key={u.key} className="flex gap-2 text-sm font-medium leading-relaxed">
                <Sparkle className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span className="min-w-0">{dateText(u)}</span>
              </p>
            ))}
          </div>
        </>
      ) : null}

      {people.length ? (
        <>
          <Subhead>{t("advDaysAhead")}</Subhead>
          <div className="mt-2 space-y-3">
            {people.map((person) => (
              <button
                key={person.tracker.id}
                type="button"
                className="block w-full text-left active:opacity-70"
                onClick={() => {
                  selectCycle(person.tracker.id);
                  setCycleSheet(true);
                }}
              >
                <span className="block truncate text-base font-semibold">{trackerLabel(person.tracker, t)}</span>
                {person.fertileStart && person.ovulation ? (
                  <span className="mt-0.5 block text-sm text-dim">
                    {fill(t("advFertile"), { a: fmtShort(person.fertileStart, lang), b: fmtShort(person.ovulation, lang) })}
                  </span>
                ) : null}
                {person.ovulation ? (
                  <span className="block text-sm text-dim">{fill(t("advOvulation"), { d: fmtDate(person.ovulation, lang) })}</span>
                ) : null}
                {person.late > 0 ? (
                  <span className="block text-sm text-dim">{t("advPeriodLate")}</span>
                ) : person.nextPeriod ? (
                  <span className="block text-sm text-dim">{fill(t("advPeriod"), { d: fmtShort(person.nextPeriod, lang) })}</span>
                ) : null}
                {person.regularity === "irregular" ? (
                  <span className="block text-sm text-dim">{fill(t("advMargin"), { n: person.window })}</span>
                ) : null}
                {person.regularity === "learning" && person.lowMissing > 0 ? (
                  <span className="block text-sm text-dim">{fill(t("advLearning"), { n: person.lowMissing })}</span>
                ) : null}
                {person.lowReady && person.low.low ? (
                  <span className="block text-sm text-dim">
                    {fill(t("advLow"), { a: fmtShort(person.low.low.start, lang), b: fmtShort(person.low.low.end, lang) })}
                  </span>
                ) : null}
                {person.lowReady && person.low.early ? (
                  <span className="block text-sm text-dim">
                    {fill(t("advLow"), { a: fmtShort(person.low.early.start, lang), b: fmtShort(person.low.early.end, lang) })}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {lastSession ? (
        <>
          <Subhead>{t("advLastTime")}</Subhead>
          <button type="button" className="mt-2 block w-full text-left active:opacity-70" onClick={() => openRange(lastSession.date, lastSession.date)}>
            <span className="block text-sm leading-relaxed">
              <b>{lastSession.partnerName || t("solo")}</b> · {fmtDate(lastSession.date, lang)}
              {lastSession.durationMins ? <> · {fmtDuration(lastSession.durationMins)}</> : null}
              {lastSession.place ? <> · {placeLabel(lang, lastSession.place)}</> : null}
            </span>
            <span className="mt-2 grid gap-1">
              <DialRow label={t("overall")} value={lastSession.overall} style={ratingStyle} />
              <DialRow label={t("satisfaction")} value={lastSession.satisfaction} style={ratingStyle} />
              <DialRow label={t("intensity")} value={lastSession.intensity} style={ratingStyle} />
              <DialRow label={t("connection")} value={lastSession.connection} style={ratingStyle} />
              <DialRow label={t("energy")} value={lastSession.energy} style={ratingStyle} />
            </span>
            {lastSession.positions.length ? (
              <span className="mt-2 block text-sm text-dim">
                {t("positions")}: {lastSession.positions.map((id) => positionLabel(lang, id)).join(", ")}
              </span>
            ) : null}
            {lastSession.contraception.length ? (
              <span className="block text-sm text-dim">
                {t("contraception")}: {lastSession.contraception.map((id) => methodLabel(id)).join(", ")}
              </span>
            ) : null}
            {lastSession.problems.length ? (
              <span className="block text-sm text-dim">
                {t("advWhatOff")}: {lastSession.problems.map((id) => problemLabel(id)).join(", ")}
              </span>
            ) : null}
            {last && last.phase && last.phase !== "quiet" ? (
              <span className="block text-sm text-dim">{fill(t("advPhase"), { phase: lc(t(phaseKey(last.phase))) })}</span>
            ) : null}
          </button>
        </>
      ) : null}

      {lines.length || dates.soon.length ? (
        <>
          <Subhead>{t("advNext")}</Subhead>
          <div className="mt-2 space-y-2">
            {lines.map((line, index) => (
              <p key={index} className="flex gap-2 text-sm leading-relaxed">
                <Sparkle className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span className="min-w-0">{lineText(line)}</span>
              </p>
            ))}
            {dates.soon.map((u) => (
              <p key={u.key} className="flex gap-2 text-sm leading-relaxed" data-testid="advisor-date-soon">
                <Sparkle className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span className="min-w-0">{dateText(u)}</span>
              </p>
            ))}
          </div>
        </>
      ) : null}

      {voices ? (
        <>
          <Subhead>{t("tvTitle")}</Subhead>
          <p className="mt-2 flex gap-2 text-sm leading-relaxed" data-testid="advisor-voices">
            <Sparkle className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span className="min-w-0">
              {voices.gap
                ? fill(t("advVoicesGap"), {
                    dial: lc(t(voices.gap.dial === "overall" ? "overall" : voices.gap.dial)),
                    a: voices.gap.his.toFixed(1),
                    name: voices.partnerName,
                    b: voices.gap.hers.toFixed(1),
                  })
                : fill(t("advVoicesSame"), { k: voices.sameOverall, n: voices.paired })}
            </span>
          </p>
        </>
      ) : null}

      {shownFact ? (
        <>
          <Subhead>{t("advKnow")}</Subhead>
          <p className="mt-2 flex gap-2 text-sm leading-relaxed">
            <Sparkle className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span className="min-w-0">
              {shownFact.kind === "newPosition"
                ? fill(t("advFactNew"), { position: positionLabel(lang, shownFact.position), d: fmtDate(shownFact.date, lang) })
                : shownFact.kind === "streak"
                  ? `${t("funStreakA")} ${shownFact.days} ${t("funStreakB")}`
                  : shownFact.kind === "pattern"
                    ? fill(t("advPattern"), {
                        n: shownFact.n,
                        cause: shownFact.reason === "custom" ? (shownFact.custom ?? "") : t(QUIET_REASON_KEY[shownFact.reason]),
                      })
                    : shownFact.kind === "cyclePattern"
                      ? fill(t(shownFact.self ? "advCyPattern" : "advCyPatternP"), {
                          n: shownFact.n,
                          name: shownFact.name,
                          note: shownFact.reasonId === "other" ? (shownFact.noteText ?? "") : t(REASON_KEY[shownFact.reasonId]),
                        })
                      : fill(t("advFactFirmer"), { name: trackerLabel(shownFact.tracker, t), n: shownFact.missing })}
            </span>
          </p>
        </>
      ) : null}
    </Card>
  );
}
