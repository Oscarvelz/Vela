import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { JournalApp } from "@/components/vela/journal-app";

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
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          next?.addEventListener("statechange", () => {
            // A new version took over: reload only when the journal is not open, so nothing is interrupted.
            if (next.state === "activated" && navigator.serviceWorker.controller && !document.querySelector(".ag-tabbar")) {
              location.reload();
            }
          });
        });
        setInterval(() => void reg.update(), 60 * 60 * 1000);
      })
      .catch(() => undefined);
  });
}
