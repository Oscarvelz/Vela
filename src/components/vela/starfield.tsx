import { useEffect, useRef } from "react";
import { isPaging } from "@/lib/vela/paging";

/*
  Firmament sky: a quiet field of twinkling stars that drifts very slowly,
  with a rare shooting star. Drawn on one canvas behind the whole app.
  - Pauses when the tab is hidden; ~30 fps to stay gentle on the battery.
  - Honors "reduce motion": the sky is drawn once and stays still.
*/

type Star = { x: number; y: number; r: number; a: number; tw: number; ph: number; warm: boolean; depth: number };
type Meteor = { x: number; y: number; vx: number; vy: number; life: number; max: number };

export function Starfield({ dense = false }: { dense?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let stars: Star[] = [];
    let meteor: Meteor | null = null;
    let nextMeteor = performance.now() + 6000 + Math.random() * 8000;
    let raf = 0;
    let last = 0;
    let t0 = performance.now();

    const seed = () => {
      const count = Math.round(((w * h) / (dense ? 5200 : 7600)) * 1);
      stars = Array.from({ length: Math.min(count, 420) }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.35 + depth * depth * 1.25,
          a: 0.25 + Math.random() * 0.6,
          tw: 0.4 + Math.random() * 1.6,
          ph: Math.random() * Math.PI * 2,
          warm: Math.random() < 0.12,
          depth,
        };
      });
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (still) draw(performance.now());
    };

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        // Slow drift: nearer stars move a touch faster (parallax).
        const dx = still ? 0 : (t * (1.2 + s.depth * 2.4)) % (w + 4);
        let x = s.x + dx;
        if (x > w + 2) x -= w + 4;
        const tw = still ? 1 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph);
        const alpha = s.a * tw;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.warm ? "#ffe2a8" : "#e9eeff";
        ctx.beginPath();
        ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > 1.15 && tw > 0.85) {
          // A soft halo on the brightest moments of the bigger stars.
          ctx.globalAlpha = alpha * 0.18;
          ctx.beginPath();
          ctx.arc(x, s.y, s.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (meteor) {
        const m = meteor;
        const p = m.life / m.max;
        const fade = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
        const tail = 90;
        const len = Math.hypot(m.vx, m.vy);
        const tx = m.x - (m.vx / len) * tail;
        const ty = m.y - (m.vy / len) * tail;
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `rgba(255,236,190,${0.85 * fade})`);
        g.addColorStop(1, "rgba(255,236,190,0)");
        ctx.globalAlpha = 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // A tab is being dragged or sliding in: hold the sky so the page gets every frame (see paging.ts).
      if (isPaging()) {
        last = now;
        return;
      }
      if (now - last < 33) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!meteor && now > nextMeteor) {
        const fromLeft = Math.random() < 0.5;
        const speed = 520 + Math.random() * 260;
        const angle = (18 + Math.random() * 16) * (Math.PI / 180);
        meteor = {
          x: fromLeft ? Math.random() * w * 0.5 : w * 0.5 + Math.random() * w * 0.5,
          y: Math.random() * h * 0.35,
          vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          max: 0.9 + Math.random() * 0.4,
        };
      }
      if (meteor) {
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        meteor.life += dt;
        if (meteor.life >= meteor.max) {
          meteor = null;
          nextMeteor = now + 9000 + Math.random() * 12000;
        }
      }
      draw(now);
    };

    const onVisible = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === "visible" && !still) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    if (!still) {
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dense]);

  return (
    <div className="vela-sky" aria-hidden>
      <canvas ref={ref} />
      <div className="vela-sky-glow" />
    </div>
  );
}
