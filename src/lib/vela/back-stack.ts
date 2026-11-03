/*
 * Android back (button / gesture), browser Back and Escape: one layered stack for the whole app.
 *
 * Every open layer (dialog, sheet, picker, panel, Settings, a sub-view, a non-Home tab) registers here with
 * useBackLayer(). The browser history holds exactly one entry of ours per open layer, on top of the app's own
 * entry: { velaBack: depth }. Back pops one entry and the top layer closes (innermost first). On Home with
 * nothing open there is no entry of ours left, so back leaves the app as Android expects.
 *
 * Kept in sync both ways:
 * - Back / gesture: popstate lands on depth d → close layers from the top until d remain.
 * - A layer closed by its own button (or unmounted, e.g. on lock) → its entry is removed with a quiet
 *   history.back(), so no "ghost" entry ever needs an extra press.
 * - Entries are only pushed right after a real tap or key (Chrome skips history entries a page adds without
 *   user activation, which would make back jump past the app). A layer that opens without one (a scrub that
 *   starts mid-drag) gets its entry at the next tap/release; until then Escape still closes it.
 * - Reload / service-worker update: leftover entries of ours (and the older agStack/agSheet/agConfirm entries)
 *   are dropped quietly on start, so nothing is "open" in history that isn't open on screen.
 * The URL never changes (pushState with an empty url), so GitHub Pages' /Vela/ path stays as it is.
 */
import { useEffect, useRef } from "react";

type Layer = { seq: number; tier: number; name: string; back: () => void };

const layers: Layer[] = [];
let seq = 0;
/** history.back() calls we made and whose popstate has not arrived yet. */
let pending = 0;
let pendingTimer = 0;
/** A real tap/key happened since our last push (Chrome allows one history entry per user activation). */
let interacted = false;
let scheduled = false;
let installed = false;

const LEGACY_DEPTH = 1_000;

function depthOf(state: unknown): number {
  const s = state as Record<string, unknown> | null;
  if (!s || typeof s !== "object") return 0;
  if (typeof s.velaBack === "number") return s.velaBack;
  // Entries left by the previous back handling (before Nov 2 2026): never ours to keep.
  if (s.agSheet || s.agConfirm || (Array.isArray(s.agStack) && s.agStack.length)) return LEGACY_DEPTH;
  return 0;
}

function canPush() {
  if (!interacted) return false;
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive : true;
}

function publish() {
  if (import.meta.env.VITE_E2E === "1") {
    (window as unknown as { __velaBack: unknown }).__velaBack = {
      layers: layers.map((layer) => layer.name),
      depth: depthOf(history.state),
      pending,
    };
  }
}

function reconcile() {
  scheduled = false;
  publish();
  if (pending > 0) return;
  const depth = depthOf(history.state);
  if (depth > layers.length) {
    pending += 1;
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => {
      // history.back() did nothing (no entry below): make this entry the app's own and carry on.
      if (pending > 0) {
        pending = 0;
        if (depthOf(history.state) > layers.length) history.replaceState(null, "");
        reconcile();
      }
    }, 1200);
    history.back();
  } else if (depth < layers.length && canPush()) {
    interacted = false;
    history.pushState({ velaBack: depth + 1 }, "");
    publish();
    // One entry per tap: anything still missing waits for the next one.
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(reconcile);
}

function closeTop() {
  const top = layers.pop();
  if (!top) return false;
  try {
    top.back();
  } catch (error) {
    console.error(error);
  }
  return true;
}

function onPop(event: PopStateEvent) {
  if (pending > 0) {
    pending -= 1;
    if (pending === 0) window.clearTimeout(pendingTimer);
    schedule();
    return;
  }
  const depth = depthOf(event.state);
  // Back (or gesture): close from the top until as many layers remain as entries.
  let guard = 50;
  while (layers.length > depth && guard-- > 0) closeTop();
  schedule();
}

function onInteract(event: Event) {
  if (!event.isTrusted) return;
  if (event instanceof KeyboardEvent && (event.key === "Escape" || event.key === "Tab" || event.key === "Shift")) return;
  interacted = true;
  schedule();
}

function onKey(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented || !layers.length) return;
  event.preventDefault();
  event.stopPropagation();
  closeTop();
  schedule();
}

/** Called once at start (main.tsx), before the app renders: drops leftover entries after a reload. */
export function installBackStack() {
  if (installed) return;
  installed = true;
  window.addEventListener("popstate", onPop);
  for (const type of ["pointerdown", "pointerup", "touchend", "keydown", "click"]) {
    window.addEventListener(type, onInteract, { capture: true, passive: true });
  }
  window.addEventListener("keydown", onKey);
  // After a reload (or a service-worker update) nothing is open yet: entries of ours left on top go quietly.
  schedule();
}

function add(layer: Layer) {
  layers.push(layer);
  layers.sort((a, b) => a.tier - b.tier || a.seq - b.seq);
  schedule();
}

function remove(layer: Layer) {
  const index = layers.indexOf(layer);
  if (index >= 0) layers.splice(index, 1);
  schedule();
}

/** Tiers: 0 a non-Home tab · 1 a sub-view inside a tab · 2 a panel/filter in a view · 3 Settings ·
 *  4 a Settings section · 10 (default) overlays, dialogs, pickers — in the order they opened. */
export function useBackLayer(active: boolean, onBack: () => void, opts: { tier?: number; name?: string } = {}) {
  const ref = useRef(onBack);
  ref.current = onBack;
  const tier = opts.tier ?? 10;
  const name = opts.name ?? "layer";
  useEffect(() => {
    if (!active) return;
    seq += 1;
    const layer: Layer = { seq, tier, name, back: () => ref.current() };
    add(layer);
    return () => remove(layer);
  }, [active, tier, name]);
}

/** For tests and diagnostics. */
export function backLayerNames() {
  return layers.map((layer) => layer.name);
}
