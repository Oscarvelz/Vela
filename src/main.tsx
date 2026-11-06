import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { JournalApp } from "@/components/vela/journal-app";
import { useJournal } from "@/lib/vela/store";
import { gateAsking } from "@/lib/vela/app-lock";
import { installBackStack } from "@/lib/vela/back-stack";
import { startNative } from "@/lib/vela/native";

// Test-only hook (fake data seeding). Compiled out of the real build: VITE_E2E is never set for docs/.
if (import.meta.env.VITE_E2E === "1") (window as unknown as { __velaStore: typeof useJournal }).__velaStore = useJournal;

// Android back / browser Back / Escape: one layered stack (see back-stack.ts).
installBackStack();
// Vela for Android (WebView app): back, bar colours, downloads. Does nothing in a browser or the PWA.
startNative();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JournalApp />
  </StrictMode>,
);

// Offline app shell. Only on https (GitHub Pages) or localhost.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        // A new version took over: reload only while the journal is closed (lock screen or setup), never in the
        // middle of an entry and never while the fingerprint sheet is up. If it is open, the update waits for the
        // next time it locks. Reloading on the lock screen never opens anything: the app lock asks as before.
        let pending = false;
        const apply = () => {
          if (!pending || useJournal.getState().unlocked || gateAsking()) return;
          pending = false;
          location.reload();
        };
        useJournal.subscribe((state, prev) => {
          // Right as it locks, before the fingerprint sheet comes up.
          if (prev.unlocked && !state.unlocked) apply();
        });
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          next?.addEventListener("statechange", () => {
            if (next.state === "activated" && navigator.serviceWorker.controller) {
              pending = true;
              apply();
            }
          });
        });
        setInterval(() => void reg.update(), 60 * 60 * 1000);
      })
      .catch(() => undefined);
  });
}
