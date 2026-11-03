import { fill } from "@/lib/vela/cycle-words";
import { partnerKey } from "@/lib/vela/encounters";
import { useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import { ConfirmDialog } from "./ui";

/**
 * Confirm for removing a partner from the list (Settings and the log form). It says plainly what happens:
 * the name stops being offered, and the sessions with them stay (they keep the name). Stays removed after a
 * reload and on other devices; logging with the name again brings it back.
 */
export function RemovePartnerDialog({ name, onCancel, onConfirm }: { name: string | null; onCancel: () => void; onConfirm: () => void }) {
  const t = useT();
  const sessions = useJournal((s) => s.journal.sessions);
  const key = partnerKey(name);
  const n = name ? sessions.filter((session) => partnerKey(session.partnerName) === key).length : 0;
  return (
    <ConfirmDialog
      open={name !== null}
      title={fill(t("removePartnerQ"), { name: name ?? "" })}
      name={n === 0 ? t("removePartnerKeep0") : n === 1 ? t("removePartnerKeep1") : fill(t("removePartnerKeepN"), { n })}
      confirmLabel={t("cyRemoveYes")}
      cancelLabel={t("keep")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
