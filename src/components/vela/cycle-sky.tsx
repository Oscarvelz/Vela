import { useEffect, useRef } from "react";

/*
  A small night sky inside the cycle ring (Firmament made literal).
  - Stars turn very slowly around the dial; the ones passing the fertile window glow a little brighter
    and cooler, the ones near today pick up warm amber moonlight.
  - ~20 fps, stops when the dial is off screen or the tab is hidden; drawn once with reduced motion.
  - Reads only ring indices (no dates, no entries).
*/

type Star = { a: number; d: number; r: number; base: number; tw: number; ph: number };

/** Small deterministic PRNG so the sky looks the same every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS: Star[] = (() => {
  const rand = rng(1723);
  return Array.from({ length: 96 }, (_, index) => {
    const depth = rand();
    // Two thirds sit in a band just inside the ring (they carry the phase light); the rest is faint dust
    // behind the numbers, kept dim so the type stays clean.
    const band = index % 3 !== 0;
    return {
      a: rand() * 360,
      d: band ? 0.86 + rand() * 0.12 : 0.22 + Math.sqrt(rand()) * 0.6,
      r: 0.35 + depth * depth * 0.95,
      base: 0.22 + rand() * 0.5,
      tw: 0.35 + rand() * 1.2,
      ph: rand() * Math.PI * 2,
    };
  });
})();

/** Angular distance in degrees (0–180). */
function angDist(a: number, b: number) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

export function CycleSky({
  length,
  today,
  fertile,
  ovulation,
}: {
  length: number;
  today: number;
  fertile: { from: number; to: number } | null;
  ovulation: number | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ length, today, fertile, ovulation });
  props.current = { length, today, fertile, ovulation };
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let size = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    const t0 = performance.now();

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = box.width;
      canvas.width = Math.max(1, Math.round(box.width * dpr));
      canvas.height = Math.max(1, Math.round(box.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    const draw = (now: number) => {
      if (!size) return;
      const day = document.documentElement.dataset.mode === "day";
      const { length: len, today: ti, fertile: fw, ovulation: ov } = props.current;
      const step = 360 / Math.max(1, len);
      const todayAngle = ti * step + step / 2;
      const fwFrom = fw ? fw.from * step : 0;
      const fwTo = fw ? fw.to * step : 0;
      const fwMid = (fwFrom + fwTo) / 2;
      const fwHalf = (fwTo - fwFrom) / 2;
      const ovAngle = ov !== null ? ov * step + step / 2 : null;
      const t = (now - t0) / 1000;
      const turn = still ? 0 : t * 0.5; // a full turn in 12 minutes
      const c = size / 2;
      const rad = size / 2;
      ctx.clearRect(0, 0, size, size);

      // Moonlight: a soft amber wash from the side of the ring where today sits.
      const mr = ((todayAngle - 90) * Math.PI) / 180;
      const mx = c + Math.cos(mr) * rad * 0.92;
      const my = c + Math.sin(mr) * rad * 0.92;
      const moon = ctx.createRadialGradient(mx, my, 0, mx, my, rad * 0.95);
      moon.addColorStop(0, day ? "rgba(183,121,31,0.10)" : "rgba(235,189,99,0.15)");
      moon.addColorStop(1, "rgba(235,189,99,0)");
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, size, size);

      for (const s of STARS) {
        const angle = (s.a + turn) % 360;
        // Fertile window: stars inside its sector brighten, fading out over ~12° past its edges.
        let fert = 0;
        if (fw) {
          const dist = angDist(angle, fwMid);
          fert = dist <= fwHalf ? 1 : Math.max(0, 1 - (dist - fwHalf) / 12);
          if (ovAngle !== null) fert = Math.min(1.4, fert + Math.max(0, 1 - angDist(angle, ovAngle) / 10) * 0.4);
        }
        const near = Math.max(0, 1 - angDist(angle, todayAngle) / 28);
        const edge = 0.45 + 0.55 * s.d; // stars near the ring feel the phase more than those at the centre
        // Behind the type (inside the band) stars stay faint specks.
        const veil = s.d < 0.85 ? 0.3 : 1;
        const twinkle = still ? 1 : 0.6 + 0.4 * Math.sin(t * s.tw + s.ph);
        let alpha = s.base * twinkle * (1 + (fert * 1.0 + near * 0.6) * edge * veil);
        alpha = Math.min(1, alpha) * veil * (day ? 0.55 : 1);
        const r = s.r * (veil < 1 ? 0.75 : 1 + fert * 0.3 * edge + near * 0.15);
        const sr = ((angle - 90) * Math.PI) / 180;
        const x = c + Math.cos(sr) * s.d * rad;
        const y = c + Math.sin(sr) * s.d * rad;
        let color: string;
        if (near * edge * veil > 0.4) color = day ? "#a5661a" : "#ffe1a3";
        else if (fert * edge * veil > 0.4) color = day ? "#127f75" : "#c9fff6";
        else color = day ? "#3b4f9e" : "#e9eeff";
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (!day && veil === 1 && r > 0.95 && alpha > 0.6) {
          ctx.globalAlpha = alpha * 0.16;
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };
    redraw.current = () => draw(performance.now());

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.visibilityState !== "visible") return;
      raf = requestAnimationFrame(frame);
      if (now - last < 50) return;
      last = now;
      draw(now);
    };
    const start = () => {
      if (still || raf || !visible || document.visibilityState !== "visible") return;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVis);
    // Day / night switch: redraw with the other palette.
    const mo = new MutationObserver(() => draw(performance.now()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    resize();
    start();
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    redraw.current();
  }, [length, today, fertile?.from, fertile?.to, ovulation]);

  return <canvas ref={ref} className="cy-sky" aria-hidden />;
}
