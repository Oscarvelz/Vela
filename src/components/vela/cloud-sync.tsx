import { useEffect } from "react";
import { useJournal } from "@/lib/vela/store";
import { initAuth, markDirty, syncNow } from "@/lib/vela/sync";

/** Wires the sync engine: auth state, edits → dirty, reconnect → sync. */
export function CloudSync() {
  const ready = useJournal((s) => s.ready);

  useEffect(() => {
    if (!ready) return;
    void initAuth();
    let timer = 0;
    const soon = (ms = 800) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void syncNow(), ms);
    };
    const unsub = useJournal.subscribe((state, prev) => {
      if (state.unlocked && !prev.unlocked) {
        soon(50);
        return;
      }
      if (state.vault !== prev.vault) soon(50);
      if (!state.unlocked || !prev.unlocked) return;
      if (state.journal !== prev.journal || state.keyEpoch !== prev.keyEpoch) {
        markDirty();
        soon();
      }
    });
    const online = () => soon(100);
    const visible = () => {
      if (document.visibilityState === "visible") soon(100);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      unsub();
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [ready]);

  return null;
}
