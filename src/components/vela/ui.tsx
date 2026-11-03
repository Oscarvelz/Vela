import { createPortal } from "react-dom";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { ChevronDown, Eye, EyeOff, Flame, Heart, Star } from "lucide-react";
import { useT } from "@/lib/vela/i18n";
import { cn } from "@/lib/cn";
import { useBackLayer } from "@/lib/vela/back-stack";
import type { RatingStyle } from "@/lib/vela/catalog";

const buttonStyles = {
  primary: "ag-glow border border-transparent",
  soft: "ag-soft border border-transparent",
  ghost: "border border-border bg-transparent text-fg",
  danger: "border border-danger/60 bg-transparent text-danger",
  save: "ag-save border border-transparent",
} as const;

/** A brief ring + amber sparks + check from a save button. Lives on <body> so it outlives a form reset. */
export function saveBurst(target: HTMLElement | null) {
  if (!target || typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const rect = target.getBoundingClientRect();
  const root = document.createElement("div");
  root.className = "ag-burst";
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: getComputedStyle(target).borderRadius });
  const ring = document.createElement("span");
  ring.className = "ag-burst-ring";
  root.appendChild(ring);
  const sparks = 10;
  for (let index = 0; index < sparks; index++) {
    const angle = (index / sparks) * Math.PI * 2 + (index % 2 ? 0.3 : 0);
    const reach = index % 2 ? 0.62 : 0.5;
    const spark = document.createElement("span");
    spark.className = "ag-burst-spark";
    spark.style.setProperty("--dx", `${Math.cos(angle) * rect.width * reach}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * (rect.height * 0.5 + 26)}px`);
    spark.style.animationDelay = `${(index % 3) * 30}ms`;
    root.appendChild(spark);
  }
  const check = document.createElement("span");
  check.className = "ag-burst-check";
  const look = getComputedStyle(target);
  Object.assign(check.style, { backgroundImage: look.backgroundImage, backgroundColor: look.backgroundColor, color: look.color });
  check.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  root.appendChild(check);
  document.body.appendChild(root);
  // The form may reset and move the button on save: follow its replacement (same test id) while the burst plays.
  const testId = target.dataset.testid;
  const started = performance.now();
  const follow = () => {
    if (!root.isConnected) return;
    const live = target.isConnected ? target : testId ? document.querySelector<HTMLElement>(`[data-testid="${testId}"]`) : null;
    const box = live?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0) Object.assign(root.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    if (performance.now() - started < 900) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  window.setTimeout(() => root.remove(), 900);
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ConfirmDialog({
  open,
  title,
  name,
  confirmLabel,
  cancelLabel,
  confirmDisabled,
  confirmTone = "danger",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  name?: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmDisabled?: boolean;
  confirmTone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  if (!open) return null;
  // Rendered on <body>, so no parent's stacking context (settings pane, tab bar) can cover its buttons.
  return createPortal(
    <ConfirmDialogBody
      title={title}
      name={name}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      confirmDisabled={confirmDisabled}
      confirmTone={confirmTone}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {children}
    </ConfirmDialogBody>,
    document.body,
  );
}

function ConfirmDialogBody({
  title,
  name,
  confirmLabel,
  cancelLabel,
  confirmDisabled,
  confirmTone = "danger",
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  name?: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmDisabled?: boolean;
  confirmTone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  // Back / gesture / Escape = Cancel (innermost layer first; see back-stack).
  useBackLayer(true, onCancel, { name: "confirm" });
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-6 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="ag-panel w-full max-w-sm rounded-[1.6rem] border border-accent/35 px-5 py-6"
        data-noswipe
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="border-b border-accent/25 pb-3 font-display text-2xl leading-tight">
          {title}
        </h2>
        {name ? <p className="mt-3 text-sm leading-relaxed text-dim">{name}</p> : null}
        {children}
        <div className="mt-5 flex gap-2">
          <Button variant={confirmTone} className="flex-1" disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "ag-orb grid size-11 place-items-center rounded-full border border-border text-accent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("ag-panel rounded-card border border-border px-4 py-4", className)} {...props}>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  "w-full rounded-control border border-border bg-surface-2 px-4 py-3 text-base outline-none focus:border-accent";

export const pinFieldProps = {
  type: "text" as const,
  autoComplete: "off",
  autoCorrect: "off" as const,
  autoCapitalize: "off" as const,
  spellCheck: false,
  inputMode: "text" as const,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
};

export function MenuSelect<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  id?: string;
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  // Back / gesture / Escape close the list first.
  useBackLayer(open, () => setOpen(false), { name: "menu" });

  return (
    <div ref={root} className={cn(compact && "relative min-w-0 flex-1")}>
      <button
        id={id}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          compact
            ? "flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 text-left text-xs font-semibold"
            : cn(fieldClass, "flex items-center justify-between gap-3 text-left"),
        )}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="min-w-0 truncate">{current}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-accent transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          role="listbox"
          className={cn(
            "z-30 space-y-1 rounded-card border border-border bg-surface p-1.5",
            compact ? "absolute top-full right-0 left-0 mt-1" : "mt-2",
          )}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium",
                  selected ? "border border-accent bg-surface-2 text-fg" : "border border-transparent text-dim",
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected ? <span className="text-accent">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function RatingIcon({
  style,
  className,
  active = true,
}: {
  style: RatingStyle;
  className?: string;
  active?: boolean;
}) {
  const Icon = style === "star" ? Star : style === "heart" ? Heart : Flame;
  return (
    <Icon
      className={cn(className, active ? "text-accent" : "text-dim/35")}
      strokeWidth={1.75}
      fill={active && style !== "flame" ? "currentColor" : "none"}
    />
  );
}

export function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-8 w-14 shrink-0 rounded-full border transition-colors",
        checked ? "border-accent bg-accent-soft" : "border-border bg-surface-2",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0 size-6 rounded-full transition-transform",
          checked ? "translate-x-7 bg-accent" : "translate-x-0.5 bg-dim",
        )}
      />
    </button>
  );
}


/** A password / passphrase field with an eye button to show or hide what was typed. */
/** True when the browser's password manager / autofill put the current value there. */
export function filledByBrowser(el: HTMLInputElement | null) {
  if (!el) return false;
  if (el.dataset.autofilled === "1") return true;
  for (const sel of [":autofill", ":-webkit-autofill"]) {
    try {
      if (el.matches(sel)) return true;
    } catch {
      /* selector not supported */
    }
  }
  return false;
}

/**
 * The journal passphrase field. It is not a website login, so password managers must neither fill
 * it nor save it: all Oscar's apps share one origin, and Google Password Manager would otherwise
 * drop the account (or another app's) password in here. Still type=password so phone keyboards
 * stay in their private mode (no autocorrect, no learning, no auto-capital, no suggestion spaces).
 */
export const PassphraseInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "autoComplete">>(
  function PassphraseInput({ className, onInput, ...props }, ref) {
    const t = useT();
    const [shown, setShown] = useState(false);
    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          type={shown ? "text" : "password"}
          name={props.name ?? `vela-journal-passphrase-${props.id ?? "field"}`}
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          data-passphrase="1"
          onInput={(event) => {
            const ie = event.nativeEvent as InputEvent;
            const typed = typeof ie.inputType === "string" && ie.inputType !== "" && ie.inputType !== "insertReplacementText";
            event.currentTarget.dataset.autofilled = typed ? "0" : "1";
            onInput?.(event);
          }}
          className={cn(className, "pr-12")}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-dim hover:text-fg"
          aria-label={shown ? t("hidePassword") : t("showPassword")}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
    );
  },
);

export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={cn(className, "pr-12")} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-dim hover:text-fg"
        aria-label={shown ? t("hidePassword") : t("showPassword")}
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
      >
        {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
