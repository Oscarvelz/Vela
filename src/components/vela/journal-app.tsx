import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, CalendarDays, List, Moon, Settings, Sun } from "lucide-react";
import { useT } from "@/lib/vela/i18n";
import { sessionToDraft, useJournal } from "@/lib/vela/store";
import { PLACES } from "@/lib/vela/catalog";
import type { TabId } from "@/lib/vela/types";
import { cn } from "@/lib/cn";
import { Starfield } from "./starfield";
import { AuthScreen } from "./auth-screen";
import { BioOffer } from "./bio";
import { markSeen } from "@/lib/vela/app-lock";
import { CalendarView } from "./calendar-view";
import { CloudSync } from "./cloud-sync";
import { HistoryView } from "./history-view";
import { HomeView } from "./home-view";
import { InsightsView } from "./insights-view";
import { Mark } from "./mark";
import { SessionForm } from "./session-form";
import { SettingsView } from "./settings-view";
import { Button, ConfirmDialog, IconButton } from "./ui";
import { useScrollBars } from "./use-scroll-bars";
import { CyclePill } from "./cycle-card";
import { CycleLayers } from "./cycle-sheets";
import { TabBar } from "./tab-bar";
import { useBackLayer } from "@/lib/vela/back-stack";
import { finishSplash } from "@/lib/vela/splash";
import { LaunchSplash } from "./launch-splash";
import { usePager } from "./use-pager";
import { setPaging } from "@/lib/vela/paging";

const TABS: { id: TabId; icon: (props: { className?: string }) => ReactNode; label: "navHome" | "navCalendar" | "navHistory" | "navInsights" }[] = [
  { id: "home", icon: HomeIcon, label: "navHome" },
  { id: "calendar", icon: CalendarDays, label: "navCalendar" },
  { id: "history", icon: List, label: "navHistory" },
  { id: "insights", icon: BarChart3, label: "navInsights" },
];

function HomeIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}

export function JournalApp() {
  const ready = useJournal((s) => s.ready);
  const hydrate = useJournal((s) => s.hydrate);
  // The launch splash: once per page load (never on in-app navigation), over the app as it mounts underneath.
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  // Same frame as the splash leaves: the lock screen's hero shows in place and the fingerprint prompt may ask.
  useLayoutEffect(() => {
    if (!splash) finishSplash();
  }, [splash]);
  return (
    <>
      {ready ? (
        <>
          <CloudSync />
          <Gate />
        </>
      ) : null}
      {splash ? <LaunchSplash ready={ready} onDone={() => setSplash(false)} /> : null}
    </>
  );
}

function Gate() {
  const unlocked = useJournal((s) => s.unlocked);
  const theme = useJournal((s) => s.journal.settings.theme);
  const mode = useJournal((s) => s.journal.settings.mode);
  useTheme(unlocked);
  useAutoLock();
  // The sign-in / lock screen always wears the Firmament night sky.
  const sky = !unlocked || (theme === "firmament" && mode === "night");
  return (
    <>
      {sky ? <Starfield dense={!unlocked} /> : null}
      {unlocked ? <Shell /> : <AuthScreen />}
      {unlocked ? <BioOffer /> : null}
    </>
  );
}

const THEME_COLOR: Record<string, [string, string]> = {
  firmament: ["#0d1636", "#eef1fa"],
  velvet: ["#1a0e1a", "#f8efe8"],
  noir: ["#0c0c10", "#f3f3f6"],
  rose: ["#241016", "#fff5f7"],
  ocean: ["#071618", "#eef8f7"],
  emerald: ["#0b1910", "#f2f8f4"],
};

function useTheme(unlocked: boolean) {
  const chosenTheme = useJournal((s) => s.journal.settings.theme);
  const chosenMode = useJournal((s) => s.journal.settings.mode);
  const theme = unlocked ? chosenTheme : "firmament";
  const mode = unlocked ? chosenMode : "night";
  const language = useJournal((s) => s.journal.settings.language);
  const discreet = useJournal((s) => s.journal.settings.discreet);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    root.lang = language;
    const meta = document.querySelector('meta[name="theme-color"]');
    const colors = THEME_COLOR[theme] ?? THEME_COLOR.firmament;
    meta?.setAttribute("content", mode === "day" ? colors[1] : colors[0]);
    document.title = discreet ? (language === "es" ? "Diario" : "Journal") : "Vela";
  }, [theme, mode, language, discreet]);
}

/* Lock like Journey: leaving Vela for longer than "lock after leaving" (10 s by default) locks it behind the
   app lock; coming back sooner, a file picker, or the fingerprint sheet itself never does (see store.noteHidden). */
function useAutoLock() {
  const touch = useJournal((s) => s.touch);
  useEffect(() => {
    const bump = () => touch();
    const onVisible = () => {
      if (document.visibilityState === "visible") useJournal.getState().noteVisible();
      else useJournal.getState().noteHidden();
    };
    // Closing / reloading: only remember when Vela was last in use (the next launch asks anyway).
    // While hidden, the time it was hidden stays the last use (a reload after a long time away must ask).
    const onPageHide = () => {
      if (useJournal.getState().unlocked && document.visibilityState === "visible") markSeen();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) useJournal.getState().noteVisible();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pointerdown", bump, { passive: true });
    window.addEventListener("keydown", bump, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    // Vela for Android: the app also says when it leaves and comes back (never fired in a browser).
    const onNativeHidden = () => useJournal.getState().noteHidden();
    const onNativeVisible = () => useJournal.getState().noteVisible();
    window.addEventListener("velanative-hidden", onNativeHidden);
    window.addEventListener("velanative-visible", onNativeVisible);
    return () => {
      window.removeEventListener("velanative-hidden", onNativeHidden);
      window.removeEventListener("velanative-visible", onNativeVisible);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [touch]);
}

function Shell() {
  const t = useT();
  const tab = useJournal((s) => s.tab);
  const settingsOpen = useJournal((s) => s.settingsOpen);
  const editingId = useJournal((s) => s.editingId);
  const mode = useJournal((s) => s.journal.settings.mode);
  const discreet = useJournal((s) => s.journal.settings.discreet);
  const toggleMode = useJournal((s) => s.toggleMode);
  const setTab = useJournal((s) => s.setTab);
  const setSettingsOpen = useJournal((s) => s.setSettingsOpen);
  const closeEdit = useJournal((s) => s.closeEdit);
  const histFrom = useJournal((s) => s.histFrom);
  const histTo = useJournal((s) => s.histTo);
  const histPhase = useJournal((s) => s.histPhase);
  const toast = useJournal((s) => s.toast);
  const toastAction = useJournal((s) => s.toastAction);
  const shift = useRef(16);
  const pane = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // A swipe that commits slides the next tab in from that side (dir 1 = from the right); a tab-bar tap,
  // back or settings keeps the soft fade. Held for the life of that view so its class never changes.
  const slide = useRef<{ key: string; dir: number } | null>(null);
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  useScrollBars({ scroller: window, header: headerEl, dock: dockEl });

  // Back / gesture (back-stack): open layers close innermost first; then a range drill-down returns to the
  // tab it came from, any other tab returns to Home, and on Home back leaves the app.
  const lastTab = useRef<TabId>(tab);
  const prevTab = useRef<TabId>(tab);
  if (prevTab.current !== tab) {
    lastTab.current = prevTab.current;
    prevTab.current = tab;
  }
  const rangeOn = Boolean(histPhase || histFrom || histTo);
  const rangeFrom = useRef<TabId>("insights");
  useEffect(() => {
    if (rangeOn) rangeFrom.current = tab === "history" && lastTab.current !== "history" ? lastTab.current : tab;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeOn]);
  useBackLayer(tab !== "home", () => {
    shift.current = -18;
    useJournal.getState().setTab("home");
  }, { tier: 0, name: "tab" });
  useBackLayer(rangeOn, () => {
    const state = useJournal.getState();
    state.clearHistRange();
    shift.current = -18;
    if (state.tab === "history") state.setTab(rangeFrom.current);
  }, { tier: 1, name: "range" });
  useBackLayer(settingsOpen, () => setSettingsOpen(false), { tier: 3, name: "settings" });
  useBackLayer(Boolean(editingId), () => closeEdit(), { name: "edit" });

  function goTab(next: TabId, direction: number) {
    shift.current = direction >= 0 ? 18 : -18;
    const state = useJournal.getState();
    // A tab tap closes what is open over the view (their history entries go with them, see back-stack).
    if (state.editingId) state.closeEdit();
    if (state.settingsOpen) state.setSettingsOpen(false);
    if (state.histFrom || state.histTo || state.histPhase) state.clearHistRange();
    setTab(next);
  }

  function cycle(direction: 1 | -1) {
    if (useJournal.getState().settingsOpen || useJournal.getState().editingId) return;
    const order: TabId[] = ["home", "calendar", "history", "insights"];
    const index = order.indexOf(useJournal.getState().tab);
    goTab(order[(index + direction + order.length) % order.length], direction);
  }

  const cycleRef = useRef(cycle);
  cycleRef.current = cycle;
  usePager(root, pane, (direction) => {
    const state = useJournal.getState();
    if (state.settingsOpen || state.editingId) return false;
    const order: TabId[] = ["home", "calendar", "history", "insights"];
    const next = order[(order.indexOf(state.tab) + direction + order.length) % order.length];
    slide.current = { key: next, dir: direction };
    cycleRef.current(direction);
    return true;
  });
  const viewKey = settingsOpen ? "settings" : tab;
  if (slide.current && slide.current.key !== viewKey) slide.current = null;
  const slideDir = slide.current?.dir ?? 0;

  const brand = discreet ? t("discreetName") : "VELA";
  const tag = discreet ? t("discreetTagline") : t("tagline");

  return (
    <div ref={root} className="ag-pager-host min-h-dvh max-w-full overflow-x-clip bg-bg text-fg">
      <header ref={setHeaderEl} className="ag-header glow-header sticky top-0 z-30 border-b border-border backdrop-blur-md">
        <div className="ag-hdr-row mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Mark alive className="-mx-1 size-12" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl leading-none tracking-wide">{brand}</h1>
            <p className="ag-tagline mt-1 whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.13em] text-dim/80">{tag}</p>
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <CyclePill />
            <IconButton className="ag-hdr-btn" label={mode === "night" ? t("switchToDay") : t("switchToNight")} onClick={toggleMode}>
              {mode === "night" ? <Sun className="size-[19px]" /> : <Moon className="size-[19px]" />}
            </IconButton>
            {/* No manual Lock button in the header (Oscar, Nov 9 2026): locking his phone or
                swiping Vela out of recents locks it — the auto-lock stays, the candadito goes. */}
            <IconButton
              label={t("openSettings")}
              className={cn("ag-hdr-btn", settingsOpen && "is-on")}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings className="size-5" />
            </IconButton>
          </div>
        </div>
      </header>
      <main className="ag-screen mx-auto w-full min-w-0 max-w-5xl overflow-x-clip px-4 pt-4">
        <LegacyBanner />
        <div ref={pane} className="min-w-0 max-w-full" data-pager>
        <div
          key={viewKey}
          className={slideDir ? "ag-swipe-in" : "ag-enter"}
          style={{ ["--ag-shift" as string]: `${shift.current}px`, ["--ag-from" as string]: slideDir > 0 ? "100%" : "-100%" }}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && event.animationName === "ag-swipe-in") setPaging(false);
          }}
        >
          {settingsOpen ? (
            <SettingsView />
          ) : tab === "home" ? (
            <HomeView />
          ) : tab === "calendar" ? (
            <CalendarView />
          ) : tab === "history" ? (
            <HistoryView />
          ) : (
            <InsightsView />
          )}
        </div>
        </div>
      </main>
      <TabBar
        items={TABS.map((item) => ({ id: item.id, icon: item.icon, label: t(item.label) }))}
        active={settingsOpen ? null : tab}
        label={t("mainNav")}
        dockRef={setDockEl}
        onSelect={(id) => goTab(id, TABS.findIndex((tabItem) => tabItem.id === id) - TABS.findIndex((tabItem) => tabItem.id === tab))}
      />
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
          {toastAction ? (
            <p className="pointer-events-auto flex items-center gap-1 rounded-full border border-accent bg-surface-2 py-1 pl-4 pr-1 text-sm font-semibold shadow-lift" data-noswipe>
              <span className="min-w-0">{toast}</span>
              <button
                type="button"
                className="min-h-10 shrink-0 rounded-full px-3 font-semibold text-accent"
                data-testid="toast-action"
                onClick={() => {
                  const action = toastAction;
                  useJournal.setState({ toast: null, toastAction: null });
                  action.run();
                }}
              >
                {toastAction.label}
              </button>
            </p>
          ) : (
            <p className="rounded-full border border-accent bg-surface-2 px-4 py-2 text-sm font-semibold shadow-lift">{toast}</p>
          )}
        </div>
      ) : null}
      <CycleLayers />
      {editingId ? (
        <EditSheet
          id={editingId}
          onClose={closeEdit}
        />
      ) : null}
    </div>
  );
}

function LegacyBanner() {
  const t = useT();
  const legacy = useJournal((s) => s.legacy);
  const importLegacy = useJournal((s) => s.importLegacy);
  const discardLegacy = useJournal((s) => s.discardLegacy);
  const showToast = useJournal((s) => s.showToast);
  const [ask, setAsk] = useState(false);
  if (!legacy) return null;
  return (
    <section className="ag-panel mb-4 rounded-card border border-accent/60 px-4 py-4" data-testid="legacy-banner">
      <p className="font-semibold">{t("legacyTitle")}</p>
      <p className="mt-1 text-sm text-dim">
        {t("legacyBody")} {legacy.sessions.length}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={() => void importLegacy().then(() => showToast(t("legacyDone")))}>{t("legacyImport")}</Button>
        <Button variant="ghost" onClick={() => setAsk(true)}>
          {t("legacyDiscard")}
        </Button>
      </div>
      <ConfirmDialog
        open={ask}
        title={t("legacyDiscardQ")}
        confirmLabel={t("yesDelete")}
        cancelLabel={t("keep")}
        onCancel={() => setAsk(false)}
        onConfirm={() => {
          setAsk(false);
          discardLegacy();
        }}
      />
    </section>
  );
}

function EditSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const session = useJournal((s) => s.journal.sessions.find((item) => item.id === id));
  const encounters = useJournal((s) => s.journal.encounters);
  const places = useJournal((s) => s.journal.settings.customPlaces);
  const saveEdit = useJournal((s) => s.saveEdit);
  const showToast = useJournal((s) => s.showToast);
  if (!session) return null;
  const known = [...PLACES, ...places];
  const encounter = encounters.find((item) => item.id === session.encounterId) ?? null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("edit")}
        data-noswipe
        className="ag-panel max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-sheet border border-border px-4 py-5 sm:rounded-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 font-display text-3xl">{t("edit")}</h2>
        <SessionForm
          editing
          initial={sessionToDraft(session, known, encounter)}
          onClose={onClose}
          onSave={(draft) => {
            saveEdit(id, draft);
            showToast(`${t("saveChanges")} ✓`);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
