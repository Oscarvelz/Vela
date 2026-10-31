import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { placeLabel } from "@/lib/vela/catalog";
import { useLang, useT } from "@/lib/vela/i18n";
import { longestStreak, monthCount, sessionsSorted, topCounts, weekCount } from "@/lib/vela/stats";
import { useJournal } from "@/lib/vela/store";
import { cn } from "@/lib/cn";
import { Mark, Sparkle } from "./mark";
import { SessionCard } from "./session-card";
import { SessionForm } from "./session-form";
import { BatchLog } from "./batch-log";
import { CycleCard } from "./cycle-card";
import { Button, Card } from "./ui";

export function HomeView() {
  const t = useT();
  const lang = useLang();
  const sessions = useJournal((s) => s.journal.sessions);
  const weekStart = useJournal((s) => s.journal.settings.weekStart);
  const showForm = useJournal((s) => s.showForm);
  const setShowForm = useJournal((s) => s.setShowForm);
  const setTab = useJournal((s) => s.setTab);
  const quickLog = useJournal((s) => s.quickLog);
  const saveNew = useJournal((s) => s.saveNew);
  const saveMany = useJournal((s) => s.saveMany);
  const showToast = useJournal((s) => s.showToast);
  const [formKey, setFormKey] = useState(0);
  const [showBatch, setShowBatch] = useState(false);
  const [help, setHelp] = useState(false);
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
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
      <div className="space-y-4">
        <Card className="ag-hero px-5 py-5">
          <div className="flex items-start gap-3">
            <span className="ag-soft grid size-11 shrink-0 place-items-center rounded-[14px]">
              <Mark className="size-6" />
            </span>
            <h2 className="font-display text-[1.85rem] leading-tight">
              {total > 0 ? t("homeWelcome") : t("homeEmptyTitle")}
            </h2>
          </div>
          {total > 0 ? (
            <p className="mt-3 text-sm font-medium leading-relaxed">
              {total} {total === 1 ? t("momentKept") : t("momentsKept")} · {week} {t("thisWeekL")} · {month}{" "}
              {t("thisMonthL")}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-dim">{t("homeEmptyBody")}</p>
          )}
          <div className="mt-5 flex flex-col items-start gap-2.5">
            <Button
              className="min-w-52 whitespace-nowrap px-5 text-[13px]"
              onClick={() => {
                quickLog();
                showToast(t("quickDoneMsg"));
              }}
            >
              {t("countOneNowLabel")}
            </Button>
            <div className="grid w-full grid-cols-2 gap-1 rounded-card border border-border bg-surface p-1" role="group" aria-label={t("logMoment")}>
              <button
                type="button"
                aria-pressed={showForm}
                className={cn(
                  "min-h-11 whitespace-nowrap rounded-[0.9rem] px-2 text-center text-xs font-semibold transition",
                  showForm ? "ag-pick" : "text-dim",
                )}
                onClick={() => {
                  const next = !showForm;
                  setShowForm(next);
                  if (next) setShowBatch(false);
                }}
              >
                {t("logWithDetails")}
              </button>
              <button
                type="button"
                aria-pressed={showBatch}
                className={cn(
                  "min-h-11 whitespace-nowrap rounded-[0.9rem] px-2 text-center text-xs font-semibold transition",
                  showBatch ? "ag-pick" : "text-dim",
                )}
                onClick={() => {
                  const next = !showBatch;
                  setShowBatch(next);
                  if (next) setShowForm(false);
                }}
              >
                {t("batchLog")}
              </button>
            </div>
            <Button variant="ghost" className="px-5" onClick={() => setTab("calendar")}>
              {t("calendarBtn")}
            </Button>
          </div>
        </Card>
        <CycleCard />
        <Card className={showForm ? "" : "hidden"}>
          <div className="relative mb-4 flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl">{t("logMoment")}</h2>
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded-full border border-fg/25 text-fg/80"
              aria-label={t("sameDayTip")}
              aria-expanded={help}
              onClick={() => setHelp((open) => !open)}
            >
              <CircleHelp className="size-4" />
            </button>
            {help ? (
              <p className="absolute right-0 top-10 z-20 w-[min(18rem,calc(100%-1rem))] rounded-xl border border-fg/20 bg-surface px-3 py-2 text-sm leading-relaxed text-fg/80 shadow-lift">
                {t("sameDayTip")}
              </p>
            ) : null}
          </div>
          <SessionForm
            key={formKey}
            onSave={(draft) => {
              saveNew(draft);
              setFormKey((key) => key + 1);
              showToast(`${t("saveMoment")} ✓`);
            }}
            onSaveAll={(drafts) => {
              saveMany(drafts);
              setFormKey((key) => key + 1);
              showToast(`${t("saveThese")} ✓`);
            }}
          />
        </Card>
        <Card className={showBatch ? "" : "hidden"}>
          <h2 className="mb-4 font-display text-2xl">{t("batchTitle")}</h2>
          <BatchLog
            onSaved={() => {
              setShowBatch(false);
              showToast(`${t("batchSave")} ✓`);
            }}
          />
        </Card>
      </div>
      <div className="mt-4 space-y-4 lg:mt-0">
        <Card>
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
        <div>
          <h2 className="mb-3 font-display text-2xl">{t("recent")}</h2>
          {list.length === 0 ? (
            <Card className="py-8 text-center">
              <Sparkle className="mx-auto size-6 text-fg" />
              <p className="mt-3 font-display text-2xl">{t("nothingYet")}</p>
              <p className="mt-1 text-sm text-dim">{t("recentEmpty")}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {list.slice(0, 3).map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
