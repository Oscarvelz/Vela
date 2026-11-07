import { useEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import { setPaging } from "@/lib/vela/paging";

/*
  Tab paging (Nov 6 2026): swipe anywhere on the screen to move between Home, Calendar, History and Insights.

  - The whole screen takes the swipe (cards, buttons, labels, form fields that are not being typed in).
    Only things whose own sideways drag does something opt out: [data-noswipe] (swipe-to-reveal rows, the
    month grid, the whose-cycle switch, sheets and dialogs), the cycle dial ring, range sliders, any strip that
    really scrolls sideways, the field being typed in, the tab bar, and the screen edges (Android's back gesture).
  - The host wears touch-action: pan-y, so the browser scrolls vertically on its own (on the compositor, never
    waiting for this code) and never pans sideways; the listeners are passive.
  - After a clean sideways lock the page follows the finger 1:1 (transform only). Release commits on distance
    (22% of the width) or on a fling, otherwise it springs back. A committed swipe slides the page off and the
    next tab in from the far side; the starfield and cycle sky hold still meanwhile (paging.ts).
  - A tap never fires at the end of a drag.
*/

const OPT_OUT = "[data-noswipe], nav, input[type=range], .cy-dial-svg, [contenteditable=true]";
const EDGE = 18; // px at each side left to the system back gesture
const LOCK = 10; // px of travel before the direction is read
const COMMIT = 0.22; // share of the width that commits
const FLING = 0.35; // px/ms that commits a short swipe
const FLING_MIN = 18; // px a fling must travel at least

function isTextEntry(el: Element | null) {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"].includes(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

function scrollsSideways(target: Element, host: Element) {
  for (let el: Element | null = target; el && el !== host; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
  }
  return false;
}

export function optsOut(target: Element | null, host: Element) {
  if (!target || !host.contains(target)) return true;
  if (target.closest(OPT_OUT)) return true;
  const active = document.activeElement;
  if (isTextEntry(active) && active && (active === target || active.contains(target))) return true;
  return scrollsSideways(target, host);
}

type Gesture = {
  x: number;
  y: number;
  scrollY: number;
  lock: "" | "x" | "y";
  dx: number;
  samples: { x: number; t: number }[];
};

/** onCommit(direction) changes the tab (1 = next, -1 = previous) and returns false when it cannot. */
export function usePager(
  hostRef: RefObject<HTMLElement | null>,
  paneRef: RefObject<HTMLElement | null>,
  onCommit: (direction: 1 | -1) => boolean,
) {
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const host = hostRef.current;
    const pane = paneRef.current;
    if (!host || !pane) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let gesture: Gesture | null = null;
    let frame = 0;
    let busy = false; // a release animation is running
    let suppressUntil = 0;
    let settleTimer = 0;
    let width = 1;

    const place = (x: number) => {
      pane.style.transform = x ? `translate3d(${x}px,0,0)` : "";
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (gesture?.lock === "x") place(gesture.dx);
      });
    };
    const clearMotion = () => {
      pane.style.transition = "";
      pane.style.willChange = "";
      place(0);
    };
    const finish = (after: () => void, ms: number) => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        window.clearTimeout(settleTimer);
        pane.removeEventListener("transitionend", onEnd);
        after();
      };
      const onEnd = (event: TransitionEvent) => {
        if (event.target === pane && event.propertyName === "transform") run();
      };
      pane.addEventListener("transitionend", onEnd);
      settleTimer = window.setTimeout(run, ms + 80);
    };

    const springBack = (from: number) => {
      if (!from || reduce.matches) {
        clearMotion();
        setPaging(false);
        busy = false;
        return;
      }
      busy = true;
      pane.style.transition = "transform 240ms cubic-bezier(.2,.8,.2,1)";
      place(0);
      // place(0) clears the inline transform; the transition still runs from the last value.
      finish(() => {
        clearMotion();
        setPaging(false);
        busy = false;
      }, 240);
    };

    const commit = (direction: 1 | -1, from: number, velocity: number) => {
      const swap = () => {
        let changed = false;
        flushSync(() => {
          changed = commitRef.current(direction);
        });
        clearMotion();
        busy = false;
        if (!changed || reduce.matches) setPaging(false);
        // The new view clears paging when its slide-in ends; this is the safety net.
        else window.setTimeout(() => setPaging(false), 700);
      };
      if (reduce.matches) {
        swap();
        return;
      }
      busy = true;
      const target = direction > 0 ? -width : width;
      const remaining = Math.abs(target - from);
      const speed = Math.max(Math.abs(velocity), 1.6); // px/ms, never slower than a brisk exit
      const ms = Math.round(Math.min(220, Math.max(110, remaining / speed)));
      pane.style.transition = `transform ${ms}ms cubic-bezier(.25,.6,.35,1)`;
      place(target);
      finish(swap, ms);
    };

    const start = (event: TouchEvent) => {
      if (busy || event.touches.length !== 1) {
        gesture = null;
        return;
      }
      const point = event.touches[0];
      if (point.clientX < EDGE || point.clientX > window.innerWidth - EDGE) {
        gesture = null;
        return;
      }
      if (optsOut(event.target as Element, host)) {
        gesture = null;
        return;
      }
      gesture = {
        x: point.clientX,
        y: point.clientY,
        scrollY: window.scrollY,
        lock: "",
        dx: 0,
        samples: [{ x: point.clientX, t: event.timeStamp }],
      };
    };

    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) {
        const from = gesture.lock === "x" ? gesture.dx : 0;
        const wasX = gesture.lock === "x";
        gesture = null;
        if (wasX) springBack(from);
        return;
      }
      const point = event.touches[0];
      const dx = point.clientX - gesture.x;
      const dy = point.clientY - gesture.y;
      if (!gesture.lock) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        // Sideways wins up to 45°, the same split the browser uses for pan-y; once the page itself has
        // started scrolling, the gesture belongs to the scroll.
        const scrolled = Math.abs(window.scrollY - gesture.scrollY) > 2;
        if (!scrolled && Math.abs(dx) > Math.abs(dy)) {
          gesture.lock = "x";
          width = pane.getBoundingClientRect().width || window.innerWidth;
          pane.style.transition = "none";
          pane.style.willChange = "transform";
          setPaging(true);
          // Start from where the finger is now, without the lock's slack showing as a jump.
          gesture.x += Math.sign(dx) * Math.min(Math.abs(dx), LOCK);
        } else {
          gesture = null;
          return;
        }
      }
      // A sideways drag that the browser turned into a scroll after all: let the scroll have it.
      if (Math.abs(window.scrollY - gesture.scrollY) > 24) {
        const from = gesture.dx;
        gesture = null;
        springBack(from);
        return;
      }
      gesture.dx = point.clientX - gesture.x;
      gesture.samples.push({ x: point.clientX, t: event.timeStamp });
      while (gesture.samples.length > 2 && event.timeStamp - gesture.samples[0].t > 100) gesture.samples.shift();
      schedule();
    };

    const end = (event: TouchEvent) => {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      if (g.lock !== "x") return;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      suppressUntil = performance.now() + 320;
      const point = event.changedTouches[0];
      if (point) {
        g.dx = point.clientX - g.x;
        g.samples.push({ x: point.clientX, t: event.timeStamp });
      }
      place(g.dx);
      if (event.type === "touchcancel") {
        springBack(g.dx);
        return;
      }
      // Velocity over the last ~100 ms of movement; a finger that rested before lifting has none.
      const moves = point ? g.samples.slice(0, -1) : g.samples;
      const last = moves[moves.length - 1];
      const first = moves.find((sample) => last.t - sample.t <= 100) ?? moves[0];
      const rested = event.timeStamp - last.t > 120;
      const velocity = rested || last === first ? 0 : (last.x - first.x) / Math.max(last.t - first.t, 1);
      const far = Math.abs(g.dx) > width * COMMIT;
      const fling = Math.abs(velocity) > FLING && Math.abs(g.dx) > FLING_MIN && Math.sign(velocity) === Math.sign(g.dx);
      const flungBack = Math.abs(velocity) > FLING && Math.sign(velocity) !== Math.sign(g.dx);
      if ((far && !flungBack) || fling) commit(g.dx < 0 ? 1 : -1, g.dx, velocity);
      else springBack(g.dx);
    };

    // A drag never ends in a tap: swallow the click a browser may still send after it.
    const swallow = (event: MouseEvent) => {
      if (performance.now() < suppressUntil) {
        event.stopPropagation();
        event.preventDefault();
        suppressUntil = 0;
      }
    };

    host.addEventListener("touchstart", start, { passive: true });
    host.addEventListener("touchmove", move, { passive: true });
    host.addEventListener("touchend", end, { passive: true });
    host.addEventListener("touchcancel", end, { passive: true });
    window.addEventListener("click", swallow, true);
    return () => {
      host.removeEventListener("touchstart", start);
      host.removeEventListener("touchmove", move);
      host.removeEventListener("touchend", end);
      host.removeEventListener("touchcancel", end);
      window.removeEventListener("click", swallow, true);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      clearMotion();
      setPaging(false);
    };
  }, [hostRef, paneRef]);
}
