import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, CalendarDays, List, Lock, Moon, Settings, Sun } from "lucide-react";
import { useT } from "@/lib/vela/i18n";
import { sessionToDraft, useJournal } from "@/lib/vela/store";
import { PLACES } from "@/lib/vela/catalog";
import type { TabId } from "@/lib/vela/types";
import { cn } from "@/lib/cn";
import { Starfield } from "./starfield";
import { AuthScreen } from "./auth-screen";
import { BioOffer } from "./bio";
import { appLockOn, markSeen } from "@/lib/vela/app-lock";
import { useBioUi } from "@/lib/vela/bio-offer";
import { CalendarView } from "./calendar-view";
import { CloudSync } from "./cloud-sync";
import { HistoryView } from "./history-view";
import { HomeView } from "./home-view";
import { InsightsView } from "./insights-view";
import { FlameHalo, Mark } from "./mark";
import { SessionForm } from "./session-form";
import { SettingsView } from "./settings-view";
import { Button, ConfirmDialog, IconButton } from "./ui";
import { useScrollBars } from "./use-scroll-bars";
import { CyclePill } from "./cycle-card";
import { CycleLayers } from "./cycle-sheets";
import { TabBar } from "./tab-bar";

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
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  if (!ready) return <Splash />;
  return (
    <>
      <CloudSync />
      <Gate />
    </>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="text-center">
        <div className="vela-flame-stage mx-auto size-24">
          <FlameHalo />
          <Mark alive className="relative size-24" />
        </div>
        <p className="vela-wordmark mt-4 font-display text-3xl tracking-brand">VELA</p>
      </div>
    </div>
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
    return () => {
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
  const lockTick = useBioUi((s) => s.tick);
  // With the app lock off there is nothing to lock behind (the key stays on the device), so no Lock button.
  const lockable = lockTick >= 0 && appLockOn();
  const shift = useRef(16);
  const stack = useRef<Array<"settings" | "edit" | "range">>([]);
  const skip = useRef(false);
  const seenEdit = useRef<string | null>(null);
  const seenRange = useRef("");
  const pane = useRef<HTMLDivElement>(null);
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  useScrollBars({ scroller: window, header: headerEl, dock: dockEl });

  useEffect(() => {
    const closeLayer = (kind: "settings" | "edit" | "range") => {
      const state = useJournal.getState();
      if (kind === "edit") state.closeEdit();
      else if (kind === "settings") state.setSettingsOpen(false);
      else {
        state.clearHistRange();
        state.setTab("insights");
      }
    };
    const onPop = (event: PopStateEvent) => {
      const landed = Array.isArray(event.state?.agStack) ? (event.state.agStack as Array<"settings" | "edit" | "range">) : [];
      if (skip.current) {
        skip.current = false;
        stack.current = landed;
        return;
      }
      if (landed.length >= stack.current.length) return;
      const closed = stack.current[stack.current.length - 1];
      stack.current = landed;
      if (closed) closeLayer(closed);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!stack.current.length) return;
      event.preventDefault();
      history.back();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (editingId && seenEdit.current !== editingId) {
      const next = [...stack.current, "edit" as const];
      stack.current = next;
      history.pushState({ agStack: next }, "");
    }
    seenEdit.current = editingId;
  }, [editingId]);

  useEffect(() => {
    const key = histPhase || histFrom || histTo ? `${histPhase}|${histFrom}|${histTo}` : "";
    if (key && seenRange.current !== key && !stack.current.includes("range")) {
      const next = [...stack.current, "range" as const];
      stack.current = next;
      history.pushState({ agStack: next }, "");
    }
    seenRange.current = key;
  }, [histFrom, histTo, histPhase]);

  function pushLayer(kind: "settings") {
    const next = [...stack.current, kind];
    stack.current = next;
    history.pushState({ agStack: next }, "");
  }

  function goTab(next: TabId, direction: number) {
    shift.current = direction >= 0 ? 18 : -18;
    const state = useJournal.getState();
    const top = stack.current[stack.current.length - 1];
    if (state.editingId) {
      skip.current = true;
      state.closeEdit();
      if (stack.current.length) history.back();
    } else if (state.settingsOpen) {
      skip.current = true;
      state.setSettingsOpen(false);
      if (stack.current.length) history.back();
    } else if (top === "range") {
      skip.current = true;
      state.clearHistRange();
      history.back();
    }
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

  useEffect(() => {
    const node = pane.current;
    if (!node) return;
    let gesture: { x: number; y: number; lock: "x" | "y" | null } | null = null;

    const start = (event: TouchEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-noswipe], input, textarea, select, nav")) {
        gesture = null;
        return;
      }
      const point = event.touches[0];
      gesture = { x: point.clientX, y: point.clientY, lock: null };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      const point = event.touches[0];
      const dx = point.clientX - gesture.x;
      const dy = point.clientY - gesture.y;
      if (!gesture.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        gesture.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (gesture.lock !== "x") return;
      event.preventDefault();
    };
    const end = (event: TouchEvent) => {
      if (!gesture) return;
      const point = event.changedTouches[0];
      const dx = point.clientX - gesture.x;
      const locked = gesture.lock;
      gesture = null;
      if (locked === "x" && Math.abs(dx) > 48) cycleRef.current(dx < 0 ? 1 : -1);
    };

    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", move, { passive: false });
    node.addEventListener("touchend", end);
    node.addEventListener("touchcancel", end);
    return () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", end);
    };
  }, []);

  const brand = discreet ? t("discreetName") : "VELA";
  const tag = discreet ? t("discreetTagline") : t("tagline");

  return (
    <div className="min-h-dvh max-w-full overflow-x-clip bg-bg text-fg">
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
            {lockable ? (
              <IconButton className="ag-hdr-btn" label={t("lockVela")} data-testid="header-lock" onClick={() => useJournal.getState().lock()}>
                <Lock className="size-[19px]" />
              </IconButton>
            ) : null}
            <IconButton
              label={t("openSettings")}
              className={cn("ag-hdr-btn", settingsOpen && "is-on")}
              onClick={() => {
                if (settingsOpen) {
                  if (stack.current.length) history.back();
                  else setSettingsOpen(false);
                } else {
                  pushLayer("settings");
                  setSettingsOpen(true);
                }
              }}
            >
              <Settings className="size-5" />
            </IconButton>
          </div>
        </div>
      </header>
      <main className="ag-screen mx-auto w-full min-w-0 max-w-5xl overflow-x-clip px-4 pt-4">
        <LegacyBanner />
        <div ref={pane} className="min-w-0 max-w-full">
        <div key={settingsOpen ? "settings" : tab} className="ag-enter" style={{ ["--ag-shift" as string]: `${shift.current}px` }}>
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
          <p className="rounded-full border border-accent bg-surface-2 px-4 py-2 text-sm font-semibold shadow-lift">{toast}</p>
        </div>
      ) : null}
      <CycleLayers />
      {editingId ? (
        <EditSheet
          id={editingId}
          onClose={() => {
            skip.current = true;
            closeEdit();
            if (stack.current.length) history.back();
          }}
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
