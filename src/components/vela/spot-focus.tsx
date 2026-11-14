/* Executes a manual «Ver en la app» jump: waits patiently for the target
 * control to exist on the new screen, scrolls it into view, and draws the
 * ring over it for ~2.8 s. The ring is an overlay — the element's own
 * styles are never touched — and it dies on the first tap or scroll. */
import { useEffect, useRef, useState } from "react";
import { onSpotRequest, takeSpotRequest } from "@/lib/vela/manual-nav";

type Ring = { left: number; top: number; width: number; height: number; radius: string };

export function SpotFocus() {
  const [ring, setRing] = useState<Ring | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    const kill = () => {
      window.clearTimeout(timer.current);
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
          el = document.querySelector(`[data-topic="${req.topicId}"] button`) ?? document.querySelector(`[data-topic="${req.topicId}"]`);
        }
        if (!el) {
          if (Date.now() - started > 6000) window.clearInterval(poll);
          return;
        }
        window.clearInterval(poll);
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(() => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const cs = getComputedStyle(el);
          setRing({ left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8, radius: cs.borderRadius || "12px" });
          timer.current = window.setTimeout(() => setRing(null), 2900);
        }, 380);
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
