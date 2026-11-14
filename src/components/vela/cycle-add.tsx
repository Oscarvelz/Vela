// "Follow another cycle": add a person's cycle (yours, or a partner's). Used in Settings and on the cycle card.
import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import { MAX_TRACKERS, followsPartner } from "@/lib/vela/cycle-trackers";
import { cn } from "@/lib/cn";
import { Button, fieldClass } from "./ui";
import { useBackLayer } from "@/lib/vela/back-stack";

export function AddTracker({ onAdded, startOpen = false, onClose, bare = false }: { onAdded: (id: string) => void; startOpen?: boolean; onClose?: () => void; bare?: boolean }) {
  const t = useT();
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const partners = useJournal((s) => s.journal.partners);
  const addTracker = useJournal((s) => s.addTracker);
  const setCycle = useJournal((s) => s.setCycle);
  const [open, setOpenRaw] = useState(startOpen);
  const setOpen = (value: boolean) => {
    setOpenRaw(value);
    if (!value) onClose?.();
  };
  // In Settings the panel is its own back step; on the cycle card the card's "adding" layer owns it.
  useBackLayer(open && !onClose, () => setOpen(false), { name: "cycle-add" });
  const [kind, setKind] = useState<"self" | "partner">("partner");
  const [name, setName] = useState("");
  const hasSelf = cycles.some((tracker) => tracker.perspective === "self" && (tracker.enabled || tracker.starts.length > 0));
  const free = partners.filter((partner) => !cycles.some((tracker) => followsPartner(tracker, partner)));
  // A dormant slot — paused, holding no dates and no day-logs — can be revived for the new person
  // instead of pretending the cap is a wall; only a cap of genuinely working trackers says no,
  // and it says it out loud (the audit's silence rule, Nov 14 2026).
  const dormant = cycles.find((tracker) => !tracker.enabled && tracker.starts.length === 0 && Object.keys(tracker.days).length === 0);
  const atCap = cycles.length >= MAX_TRACKERS && !dormant;
  const add = (perspective: "self" | "partner", partnerName = "", partnerLink = "") => {
    let id: string;
    if (dormant) {
      // An unused, switched-off cycle is simply reused instead of leaving an empty one behind.
      setCycle({ enabled: true, perspective, partnerName, partnerLink }, dormant.id);
      useJournal.getState().selectCycle(dormant.id);
      id = dormant.id;
    } else {
      id = addTracker({ perspective, partnerName, partnerLink });
    }
    if (!id) {
      useJournal.getState().showToast(t("cyFullPlain"));
      return;
    }
    onAdded(id);
    setOpen(false);
    setName("");
  };
  if (!open) {
    return (
      <Button variant="ghost" className="w-full" onClick={() => { if (atCap) { useJournal.getState().showToast(t("cyFullPlain")); return; } setKind(hasSelf ? "partner" : kind); setOpen(true); }} data-testid="cycle-add-tracker">
        + {t("cyAddPerson")}
      </Button>
    );
  }
  return (
    <div className={cn("space-y-3", bare ? "border-t border-border pt-3" : "rounded-card border border-border bg-surface-2/50 p-3")} data-testid="cycle-add-panel">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("cyAddPerson")}</p>
          <p className="mt-1 text-xs leading-relaxed text-dim">{t("cyAddPersonHint")}</p>
        </div>
        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full text-dim" aria-label={t("closeEdit")} onClick={() => setOpen(false)}>
          <X className="size-4" />
        </button>
      </div>
      <div className="ag-seg grid grid-cols-2 gap-1 rounded-card p-1" role="group" aria-label={t("cyPerspective")}>
        {(["self", "partner"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={value === "self" && hasSelf}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={cn("ag-seg-btn min-h-10 rounded-[0.85rem] px-2 text-xs leading-tight font-semibold disabled:opacity-40", kind === value ? "ag-pick" : "text-dim")}
          >
            {t(value === "self" ? "cyAddSelf" : "cyAddPartner")}
          </button>
        ))}
      </div>
      {kind === "self" ? (
        <Button className="w-full" onClick={() => add("self")}>
          {t("add")}
        </Button>
      ) : (
        <>
          {free.length ? (
            <div className="flex flex-wrap gap-2">
              {free.map((partner) => (
                <button
                  key={partner}
                  type="button"
                  className="ag-pill inline-flex min-h-[37px] max-w-full items-center rounded-full border border-border px-[0.85rem] text-[0.8rem] font-semibold text-fg"
                  onClick={() => add("partner", partner, partner)}
                  data-testid="cycle-add-partner"
                >
                  <span className="min-w-0 truncate">+ {partner}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              className={cn(fieldClass, "min-w-0 flex-1")}
              value={name}
              maxLength={40}
              placeholder={t("cyHerNamePh")}
              aria-label={t("cyHerName")}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              className="shrink-0 px-4"
              disabled={!name.trim()}
              onClick={() => {
                const typed = name.trim();
                const saved = partners.find((partner) => partner.toLocaleLowerCase() === typed.toLocaleLowerCase());
                add("partner", saved ?? typed, saved ?? "");
              }}
            >
              {t("add")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
