import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { TabId } from "@/lib/vela/types";

export type TabItem = { id: TabId; icon: (props: { className?: string }) => ReactNode; label: string };

type Box = { x: number; y: number; w: number; h: number };

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Bottom tab bar with one shared active chip. The chip is measured from the active
 * button and glides between tabs: the leading edge runs ahead, the trailing edge
 * catches up (a soft stretch), it squashes a touch at the midpoint and settles with
 * a small spring overshoot. Works for taps, swipes and programmatic setTab alike,
 * because it only follows the active tab. Re-measures on resize without animating.
 */
export function TabBar({
  items,
  active,
  label,
  dockRef,
  onSelect,
}: {
  items: TabItem[];
  active: TabId | null;
  label: string;
  dockRef: (node: HTMLElement | null) => void;
  onSelect: (id: TabId) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const buttons = useRef(new Map<TabId, HTMLButtonElement>());
  const last = useRef<Box | null>(null);
  const shown = useRef(false);
  const current = useRef(active);
  current.current = active;

  const measure = (id: TabId | null): Box | null => {
    if (!id) return null;
    const node = buttons.current.get(id);
    if (!node) return null;
    return { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight };
  };

  const place = (box: Box | null) => {
    const el = chip.current;
    if (!el) return;
    if (!box) {
      el.dataset.on = "false";
      return;
    }
    el.style.width = `${box.w}px`;
    el.style.height = `${box.h}px`;
    el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
    el.dataset.on = "true";
  };

  useLayoutEffect(() => {
    const el = chip.current;
    const next = measure(active);
    const prev = last.current;
    const wasShown = shown.current;
    el?.getAnimations?.().forEach((animation) => animation.cancel());
    place(next);
    shown.current = Boolean(next);
    if (next) last.current = next;
    if (!el || !next || !prev || !wasShown || reduced() || typeof el.animate !== "function") return;
    if (prev.x === next.x && prev.y === next.y && prev.w === next.w) return;
    // Leading edge runs ahead, trailing edge lags: the chip stretches toward the new tab.
    const right = next.x > prev.x;
    const prevL = prev.x, prevR = prev.x + prev.w, nextL = next.x, nextR = next.x + next.w;
    const lead = 0.78, lag = 0.32;
    const midL = right ? prevL + (nextL - prevL) * lag : prevL + (nextL - prevL) * lead;
    const midR = right ? prevR + (nextR - prevR) * lead : prevR + (nextR - prevR) * lag;
    const midY = prev.y + (next.y - prev.y) * 0.55;
    const frame = (x: number, y: number, w: number, sy: number) => ({ transform: `translate3d(${x}px, ${y}px, 0) scaleY(${sy})`, width: `${w}px` });
    el.animate(
      [
        { ...frame(prev.x, prev.y, prev.w, 1), easing: "cubic-bezier(0.35, 0, 0.5, 1)" },
        { ...frame(midL, midY, midR - midL, 0.9), offset: 0.42, easing: "cubic-bezier(0.18, 1.45, 0.42, 1)" },
        frame(next.x, next.y, next.w, 1),
      ],
      { duration: 340 },
    );
  }, [active]);

  useLayoutEffect(() => {
    const node = row.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let width = node.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (node.offsetWidth === width) return;
      width = node.offsetWidth;
      const box = measure(current.current);
      chip.current?.getAnimations?.().forEach((animation) => animation.cancel());
      place(box);
      if (box) last.current = box;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="ag-tabbar" aria-label={label}>
      <div ref={dockRef} className="ag-tabbar-face">
        <div ref={row} className="ag-tabrow relative mx-auto flex w-full max-w-lg px-2 py-2">
          <span ref={chip} className="ag-tab-ind" data-on="false" aria-hidden data-testid="tab-indicator" />
          {items.map((item) => {
            const on = active === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  if (node) buttons.current.set(item.id, node);
                  else buttons.current.delete(item.id);
                }}
                type="button"
                data-tab={item.id}
                aria-current={on ? "page" : undefined}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "ag-tab relative z-[1] flex h-14 w-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] px-1 text-[11px] font-semibold leading-none",
                  on ? "ag-tab-on" : "text-dim",
                )}
              >
                <span className="ag-tab-ico">
                  <Icon className="size-5" />
                </span>
                <span className="ag-tab-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
