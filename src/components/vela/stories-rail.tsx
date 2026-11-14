/* The Stories rail (2.1.23) — Home's memory, right under the hero. One card per
   distance that truly has something: the person, the day, the glow — never the
   journal's words. A card opens History on exactly that day. Every card also
   carries its own way out: hide this memory, or stop a person resurfacing,
   because a memory can wound and the user is sovereign over what returns. */
import { useMemo, useState } from "react";
import { MoreVertical, X } from "lucide-react";
import { fill } from "@/lib/vela/cycle-words";
import { fmtDate, todayStr } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { findStories, type Story } from "@/lib/vela/stories";
import { hiddenIn, upcomingDates } from "@/lib/vela/anniversaries";
import { useJournal } from "@/lib/vela/store";
import { cn } from "@/lib/cn";
import { Sparkle } from "./mark";
import { RatingIcon } from "./ui";
import { Hint } from "./hint";

function distanceLabel(t: ReturnType<typeof useT>, story: Story) {
  if (story.kind === "months") return story.n === 1 ? t("storiesAMonth") : fill(t("storiesMonths"), { n: story.n });
  return story.n === 1 ? t("storiesAYear") : fill(t("storiesYears"), { n: story.n });
}

export function StoriesRail() {
  const t = useT();
  const lang = useLang();
  const allSessions = useJournal((s) => s.journal.sessions);
  const settings = useJournal((s) => s.journal.settings);
  const muted = useJournal((s) => s.journal.settings.storiesMuted);
  const style = useJournal((s) => s.journal.settings.ratingStyle);
  const openHistRange = useJournal((s) => s.openHistRange);
  const muteStoryDay = useJournal((s) => s.muteStoryDay);
  const muteStoryPerson = useJournal((s) => s.muteStoryPerson);
  const unmuteStory = useJournal((s) => s.unmuteStory);
  const showToast = useJournal((s) => s.showToast);
  const [menuDate, setMenuDate] = useState<string | null>(null);

  // The Archive law: a resting person's moments resurface only where the user
  // decided so — their sessions simply do not feed the rail.
  const sessions = allSessions.filter((s) => !hiddenIn(settings.archivedPeople, s.partnerName, "resurface"));
  const stories = useMemo(() => findStories(sessions, todayStr(), muted), [sessions, muted]);
  // Anniversary and birthday days bloom here too (2.1.24): management lives in
  // History, but the day itself is a memory surfacing on Home.
  const celebrations = useMemo(
    () => upcomingDates(settings, todayStr()).filter((u) => u.daysUntil === 0),
    [settings],
  );
  if (stories.length === 0 && celebrations.length === 0) return null;
  const menuStory = stories.find((s) => s.date === menuDate) ?? null;

  return (
    <section data-testid="stories-rail" data-spot="stories-rail" aria-label={t("storiesTitle")}>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <Sparkle className="size-4 text-accent" />
        <h2 className="font-display text-lg leading-none">{t("storiesTitle")}</h2>
        <Hint topic="historias" compact />
      </div>
      <div className="ag-stories flex gap-3 overflow-x-auto pb-1">
        {celebrations.map((u) => {
          const kindLabel =
            u.source === "birthday"
              ? t("annKindBirthday")
              : t(u.kind === "married" ? "annKindMarried" : u.kind === "met" ? "annKindMet" : u.kind === "first" ? "annKindFirst" : "annKindCustom");
          const line =
            u.source === "birthday"
              ? fill(t("annTurnsToday"), { age: u.turning ?? "" })
              : u.turning && u.turning >= 1 && u.kind === "married"
                ? fill(t("annMarriedDay"), { n: u.turning })
                : u.turning && u.turning >= 1 && u.kind === "met"
                  ? fill(t("annMetDay"), { n: u.turning })
                  : u.turning && u.turning >= 1 && u.kind === "first"
                    ? fill(t("annFirstDay"), { n: u.turning })
                    : u.turning && u.turning >= 1
                      ? fill(t("annYearsToday"), { n: u.turning })
                      : t("annTodayPlain");
          const tapDate = u.origin ?? u.date;
          return (
            <div
              key={u.key}
              className={cn("ag-story-card ag-glass", u.milestone && "ag-aurora ag-ann-today")}
              data-testid="story-celebration"
              data-milestone={u.milestone || undefined}
            >
              <button type="button" className="ag-story-main" onClick={() => openHistRange(tapDate, tapDate)}>
                <span className="ag-story-distance">{kindLabel}</span>
                <span className="ag-story-who">{u.personName ? `${u.label} · ${u.personName}` : u.label}</span>
                <span className="ag-story-date">{line}</span>
              </button>
            </div>
          );
        })}
        {stories.map((story, i) => {
          const who =
            story.partners.length === 1 ? story.partners[0] || t("solo") : fill(t("storiesMoments"), { n: story.count });
          const dateLine =
            story.partners.length === 1 && story.count > 1
              ? `${fmtDate(story.date, lang)} · ${fill(t("storiesMoments"), { n: story.count })}`
              : fmtDate(story.date, lang);
          return (
            <div
              key={story.date}
              className="ag-story-card ag-glass"
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              data-testid="story-card"
              data-date={story.date}
            >
              <button
                type="button"
                className="ag-story-main"
                onClick={() => openHistRange(story.date, story.date)}
              >
                <span className="ag-story-distance">{distanceLabel(t, story)}</span>
                <span className="ag-story-who">{who}</span>
                <span className="ag-story-date">{dateLine}</span>
                {story.bestOverall > 0 ? (
                  <span className="ag-story-glow" aria-hidden>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <RatingIcon key={level} style={style} className="size-3.5" active={Math.round(story.bestOverall) >= level} />
                    ))}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={cn("ag-story-menu-btn", menuDate === story.date && "is-open")}
                aria-label={t("storiesOptionsAria")}
                aria-expanded={menuDate === story.date}
                data-testid="story-menu-btn"
                onClick={() => setMenuDate(menuDate === story.date ? null : story.date)}
              >
                <MoreVertical className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      {menuStory ? (
        <div className="ag-story-menu" data-testid="story-menu">
          <button
            type="button"
            className="ag-story-menu-item"
            data-testid="story-hide-day"
            onClick={() => {
              const date = menuStory.date;
              muteStoryDay(date);
              setMenuDate(null);
              // A mis-tap is not a sentence (research brief, 2.1.26): the toast
              // itself carries the way back, in the house's undo pattern.
              showToast(t("storiesHiddenToast"), { label: t("cyUndo"), run: () => unmuteStory("day", date) });
            }}
          >
            {t("storiesHideDay")}
          </button>
          {menuStory.partners
            .filter((name) => name.trim() !== "")
            .map((name) => (
              <button
                key={name}
                type="button"
                className="ag-story-menu-item"
                data-testid="story-mute-person"
                onClick={() => {
                  muteStoryPerson(name);
                  setMenuDate(null);
                  showToast(fill(t("storiesMutedToast"), { name }), {
                    label: t("cyUndo"),
                    run: () => unmuteStory("person", name),
                  });
                }}
              >
                {fill(t("storiesMutePerson"), { name })}
              </button>
            ))}
          <button
            type="button"
            className="ag-story-menu-close"
            aria-label={t("cancelBtn")}
            onClick={() => setMenuDate(null)}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
