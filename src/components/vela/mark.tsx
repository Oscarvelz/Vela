import { cn } from "@/lib/cn";

/* Vela mark: a small warm glow in a navy firmament (same art as the app icon). */
export function Mark({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}favicon.svg`}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("shrink-0 rounded-[22%] shadow-[0_0_18px_rgba(255,200,90,0.18)]", className)}
    />
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 0.8 13.7 10.3 23.2 12 13.7 13.7 12 23.2 10.3 13.7 0.8 12 10.3 10.3Z"
      />
    </svg>
  );
}
