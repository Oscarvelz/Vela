/* Executes a manual «Ver en la app» jump: waits patiently for the target
 * control to exist on the new screen, scrolls it into view, and draws the
 * ring over it for ~2.8 s. The ring is an overlay — the element's own
 * styles are never touched — and it dies on the first tap or scroll.
 *
 * The ring is drawn only once the target's rect has SETTLED — two
 * consecutive measurements that agree — because a fold glide (460 ms)
 * and the smooth scroll are still moving the control long after it
 * exists; a single measure at a fixed delay drew the ring on empty
 * space, or off-screen entirely (RT-V5 B2). After the draw, the rect
 * is re-measured twice more and the ring snaps to the living control
 * if the glide's tail moved it. */
import { useEffect, useRef, useState } from "react";
import { HINT_ONLY } from "@/lib/vela/manual";
import { onSpotRequest, takeSpotRequest } from "@/lib/vela/manual-nav";

type Ring = { left: number; top: number; width: number; height: number; radius: string };

export function SpotFocus() {
  const [ring, setRing] = useState<Ring | null>(null);
  const timer = useRef(0);
  const alive = useRef(false);

  useEffect(() => {
    const kill = () => {
      window.clearTimeout(timer.current);
      alive.current = false;
      setRing(null);
    };
    const run = () => {
      const req = takeSpotRequest();
      if (!req) return;
      const started = Date.now();
      const poll = window.setInterval(() => {
        let el: Element | null = null;
        if (req.spot) el = document.querySelector(`[data-spot~="${req.spot}"]`);
        if (!el && req.topicId) {
          // The topic's own (?) bubble is the second tier. A HINT_ONLY
          // alias renders its bubble under the ALIAS id, not the
          // topic's — query those too, or the fallback can never match
          // (RT-V5 B7: decisiones / bandeja-decisiones).
          const ids = [req.topicId, ...HINT_ONLY.filter((h) => h.into === req.topicId).map((h) => h.id)];
          for (const id of ids) {
            el = document.querySelector(`[data-topic="${id}"] button`) ?? document.querySelector(`[data-topic="${id}"]`);
            if (el) break;
          }
        }
        if (!el && req.fallbackSpot) el = document.querySelector(`[data-spot~="${req.fallbackSpot}"]`);
        if (!el) {
          if (Date.now() - started > 6000) window.clearInterval(poll);
          return;
        }
        window.clearInterval(poll);
        let target = el;
        const foundAt = Date.now();
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        // Measure until the rect settles: two consecutive reads that
        // agree (within a pixel) on every field, taken while the
        // target is actually IN the viewport. A rect can sit perfectly
        // still before the smooth scroll even starts — that false
        // plateau drew rings at pre-scroll positions, thousands of
        // pixels off (rich doors bench). Cap the wait from when the
        // element was FOUND — a target that never settles still gets
        // its ring, at its last measured place, rather than none.
        let last: Ring | null = null;
        let stable = 0;
        const measure = () => {
          // React can replace the node under us; a detached node
          // measures as zeros forever and the ring would freeze at
          // its birth rect. Re-resolve through the same chain.
          if (!target.isConnected) {
            const again =
              (req.spot && document.querySelector(`[data-spot~="${req.spot}"]`)) ||
              (req.fallbackSpot && document.querySelector(`[data-spot~="${req.fallbackSpot}"]`)) ||
              null;
            if (!again) return null;
            target = again;
          }
          const r = target.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return null;
          const cs = getComputedStyle(target);
          return { left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8, radius: cs.borderRadius || "12px" };
        };
        const inView = (ring: Ring) => ring.top + ring.height > 0 && ring.top < window.innerHeight;
        const settle = window.setInterval(() => {
          const next = measure();
          if (!next) return;
          if (last && Math.abs(next.left - last.left) <= 1 && Math.abs(next.top - last.top) <= 1 && Math.abs(next.width - last.width) <= 1 && Math.abs(next.height - last.height) <= 1) stable += 1;
          else stable = 0;
          last = next;
          if ((stable >= 1 && inView(next)) || Date.now() - foundAt > 6000) {
            window.clearInterval(settle);
            alive.current = true;
            setRing(last);
            timer.current = window.setTimeout(() => {
              alive.current = false;
              setRing(null);
            }, 2900);
            // The glide's tail — and late content above the target —
            // can still move the control after the draw: keep
            // re-measuring through the ring's whole life and snap it
            // to the living control, never resurrecting a ring the
            // user already dismissed. (The rich doors bench caught a
            // reasons card settling 38 px below its ring ~2 s in.)
            for (const delay of [450, 900, 1500, 2100, 2700]) {
              window.setTimeout(() => {
                if (!alive.current) return;
                const again = measure();
                if (again) setRing(again);
              }, delay);
            }
          }
        }, 90);
      }, 120);
    };
    const off = onSpotRequest(run);
    run();
    const onInteract = () => kill();
    document.addEventListener("pointerdown", onInteract, true);
    return () => {
      off();
      document.removeEventListener("pointerdown", onInteract, true);
    };
  }, []);

  if (!ring) return null;
  return (
    <div
      className="mn-ring"
      style={{ left: ring.left, top: ring.top, width: ring.width, height: ring.height, borderRadius: ring.radius }}
      aria-hidden="true"
    />
  );
}
