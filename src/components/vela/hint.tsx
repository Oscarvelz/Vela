/* The (?) bubble — the fleet pattern: the bubble shows ONLY its topic's
 * `what` (one or two short sentences, its own text), and closes with
 * «Más en el manual →» landing on the exact topic. The manual never
 * shows the bubble's words; the two are separate texts by law. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CircleHelp } from "lucide-react";
import { findHint, pick } from "@/lib/vela/manual";
import { useJournal } from "@/lib/vela/store";
import { useLang, useT } from "@/lib/vela/i18n";
import { useBackLayer } from "@/lib/vela/back-stack";
import { richText } from "./manual-text";

export function Hint({ topic, alt = false, compact = false }: { topic: string; alt?: boolean; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const openManual = useJournal((s) => s.openManual);
  const entry = findHint(topic);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useBackLayer(open, () => setOpen(false), { name: "hint" });

  useLayoutEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const r = btn.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 24);
    const h = pop.offsetHeight;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    const below = r.bottom + 8 + h <= window.innerHeight - 12;
    const top = below ? r.bottom + 8 : Math.max(12, r.top - h - 8);
    setPos({ left, top });
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (popRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  if (!entry) return null;
  const text = pick(lang, alt && entry.whatAlt ? entry.whatAlt : entry.what);
  return (
    <span className="inline-flex align-middle" data-topic={entry.id}>
      <button
        ref={btnRef}
        type="button"
        className={`grid ${compact ? "size-7" : "size-8"} shrink-0 place-items-center rounded-full border border-fg/25 text-fg/80`}
        aria-label={t("mnHintLabel")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CircleHelp className="size-4" />
      </button>
      {open
        ? createPortal(
            <div
              ref={popRef}
              role="tooltip"
              className="fixed z-[80] rounded-xl border border-fg/20 bg-surface px-3.5 py-3 shadow-lift"
              style={{ left: pos?.left ?? 12, top: pos?.top ?? 12, width: "min(300px, calc(100vw - 24px))", visibility: pos ? "visible" : "hidden" }}
            >
              <p className="text-sm leading-relaxed text-fg/85">{richText(text)}</p>
              <button
                type="button"
                className="mt-2 inline-flex min-h-[37px] items-center gap-1.5 text-sm font-semibold text-accent"
                onClick={() => {
                  setOpen(false);
                  openManual(entry.topic.id);
                }}
              >
                {t("mnMore")}
                <ArrowRight className="size-4" />
              </button>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
