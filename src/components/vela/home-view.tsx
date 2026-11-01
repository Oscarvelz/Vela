import { useState } from "react";
import { CalendarDays, CircleHelp, Layers, PenLine, Plus } from "lucide-react";
import { useLang, useT } from "@/lib/vela/i18n";
import { sessionsSorted } from "@/lib/vela/stats";
import { useJournal } from "@/lib/vela/store";
import { cn } from "@/lib/cn";
import { Constellation, Sparkle } from "./mark";
import { SessionCard } from "./session-card";
import { SessionForm } from "./session-form";
import { BatchLog } from "./batch-log";
import { CycleCard } from "./cycle-card";
import { Button, Card } from "./ui";

export function HomeView() {
  const t = useT();
  const lang = useLang();
  const sessions = useJournal((s) => s.journal.sessions);
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
  const today = new Intl.DateTimeFormat(lang === "es" ? "es" : "en", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
      <div className="space-y-4">
        <Card className={cn("ag-hero relative isolate overflow-hidden px-5 pb-5 pt-6", "is-empty")}>
          <div className="ag-hero-sky" aria-hidden>
            <Constellation className="ag-hero-mark" />
          </div>
          <div className="ag-hero-head">
            <p className="ag-hero-eyebrow">{today}</p>
            <h2 className="ag-hero-title font-display">
              {total > 0 ? t("homeWelcome") : t("homeEmptyTitle")}
            </h2>
          </div>
          <p className="ag-hero-body">{t("homeEmptyBody")}</p>
          <Button
            className="ag-hero-cta mt-6 w-full whitespace-nowrap px-5 text-[15px]"
            onClick={() => {
              quickLog();
              showToast(t("quickDoneMsg"));
            }}
          >
            <Plus className="size-[18px]" strokeWidth={2.4} aria-hidden />
            {t("countOneNowLabel")}
          </Button>
          <div className="ag-hero-actions mt-3 grid grid-cols-3 gap-2.5" role="group" aria-label={t("logMoment")}>
            <button
              type="button"
              aria-pressed={showForm}
              aria-label={t("logWithDetails")}
              className={cn("ag-hero-tile", showForm && "is-on")}
              onClick={() => {
                const next = !showForm;
                setShowForm(next);
                if (next) setShowBatch(false);
              }}
            >
              <span className="ag-hero-tile-ico"><PenLine className="size-[18px]" aria-hidden /></span>
              <span className="ag-hero-tile-label">{t("heroDetails")}</span>
            </button>
            <button
              type="button"
              aria-pressed={showBatch}
              aria-label={t("batchLog")}
              className={cn("ag-hero-tile", showBatch && "is-on")}
              onClick={() => {
                const next = !showBatch;
                setShowBatch(next);
                if (next) setShowForm(false);
              }}
            >
              <span className="ag-hero-tile-ico"><Layers className="size-[18px]" aria-hidden /></span>
              <span className="ag-hero-tile-label">{t("heroBatch")}</span>
            </button>
            <button type="button" className="ag-hero-tile" onClick={() => setTab("calendar")}>
              <span className="ag-hero-tile-ico"><CalendarDays className="size-[18px]" aria-hidden /></span>
              <span className="ag-hero-tile-label">{t("calendarBtn")}</span>
            </button>
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
        <Card className={cn("vb-card-shell relative isolate overflow-hidden px-5 pb-5 pt-6", showBatch ? "" : "hidden")} aria-label={t("batchTitle")}>
          <BatchLog
            onSaved={() => {
              setShowBatch(false);
              showToast(`${t("batchSave")} ✓`);
            }}
          />
        </Card>
      </div>
      <div className="mt-4 space-y-4 lg:mt-0">
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
