import { placeLabel } from "@/lib/vela/catalog";
import { useLang, useT } from "@/lib/vela/i18n";
import { longestStreak, monthCount, sessionsSorted, topCounts, weekCount } from "@/lib/vela/stats";
import { useJournal } from "@/lib/vela/store";
import { Card } from "./ui";

/** "At a glance" summary, shown at the top of History (moved from Home, Nov 1 2026). */
export function GlanceCard() {
  const t = useT();
  const lang = useLang();
  const sessions = useJournal((s) => s.journal.sessions);
  const weekStart = useJournal((s) => s.journal.settings.weekStart);
  const setTab = useJournal((s) => s.setTab);
  const list = sessionsSorted(sessions);
  const total = list.length;
  const week = weekCount(sessions, weekStart);
  const month = monthCount(sessions);
  const topPlace = topCounts(list.map((s) => s.place), 1)[0];
  const topPartner = topCounts(
    list.filter((s) => s.partnerName).map((s) => s.partnerName),
    1,
  )[0];
  const streak = longestStreak(sessions);
  return (
    <Card className="ag-glass" data-testid="glance-card">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl">{t("atAGlance")}</h2>
            <button type="button" className="text-sm font-semibold text-accent" onClick={() => setTab("insights")}>
              {t("allInsights")}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat value={total} label={t("total")} />
            <Stat value={week} label={t("thisWeek")} />
            <Stat value={month} label={t("thisMonth")} />
          </div>
          {total === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-dim">{t("glanceEmpty")}</p>
          ) : (
            <div className="mt-3 space-y-1 text-sm">
              {topPlace ? (
                <p>
                  {t("byPlace")}: <b>{placeLabel(lang, topPlace[0])}</b> × {topPlace[1]}
                </p>
              ) : null}
              {topPartner ? (
                <p>
                  {t("withWhomPartner")}: <b>{topPartner[0]}</b> × {topPartner[1]}
                </p>
              ) : null}
              <p>
                {t("longestStreak")}: <b>{streak} {streak === 1 ? t("day") : t("days")}</b>
              </p>
            </div>
          )}
        </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-surface-2 px-2 py-4 text-center">
      <b className="block font-display text-3xl tabular-nums text-accent">{value}</b>
      <span className="text-xs font-semibold text-dim">{label}</span>
    </div>
  );
}

