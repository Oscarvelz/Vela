/* Manual navigation: «Ver en la app» and the dotted [[Name]] doors.
 * A go closes the manual, drives the store to the place (tab, Settings
 * section, cycle sheet), then asks the SpotFocus runner to light the
 * living control — by its data-spot token, falling back to the topic's
 * own (?) bubble. The request is one-shot and lives only in memory:
 * the manual is interface, not journal data. */
import { useJournal } from "./store";
import { findTopic, type Go } from "./manual";
import { SECTION_CLUSTER } from "./settings-clusters";

export type SpotRequest = { spot?: string; topicId?: string; fallbackSpot?: string; at: number };
let pending: SpotRequest | null = null;
const listeners = new Set<() => void>();

export function requestSpotFocus(spot: string | undefined, topicId?: string, fallbackSpot?: string) {
  pending = { spot, topicId, fallbackSpot, at: Date.now() };
  listeners.forEach((fn) => fn());
}

export function takeSpotRequest(): SpotRequest | null {
  const req = pending;
  pending = null;
  return req;
}

export function onSpotRequest(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function goToGo(go: Go, topicId: string) {
  const s = useJournal.getState();
  s.openManual(null);
  if (go.settings !== undefined) {
    s.setSettingsOpen(true);
    if (go.settings) {
      // Sections live under clusters (2.2.9): the door opens the roof too,
      // or the section would stay hidden inside its closed cluster.
      const cluster = SECTION_CLUSTER[go.settings];
      if (cluster) s.openCluster(cluster);
      if (!s.sections[go.settings]) s.toggleSection(go.settings);
    }
  } else if (go.tab) {
    s.setSettingsOpen(false);
    s.setTab(go.tab);
  }
  if (go.cycleSheet) s.setCycleSheet(true);
  // A door raises the surface it targets: the batch card stands open
  // for its ring instead of sitting hidden behind a local toggle
  // (RT-V5 B3).
  if (go.spot === "batch-card" || go.spot === "batch-save") s.setShowBatch(true);
  // A chapter's doors share a last-resort landing: when neither the
  // named control nor the topic's bubble exists in the reader's state
  // (an empty journal has no statistics cards yet; no pregnancy is
  // noted, so no projection line exists; couple mode is off, so no
  // inbox exists), the ring falls back to the surface that hosts the
  // subject — the statistics anchor, the cycle card, the couple
  // section (RT-V5 B5/B6/B7).
  const fallbackSpot =
    go.tab === "insights"
      ? "insights-top"
      : go.spot === "cycle-projected" || go.spot === "tracker-switch"
        ? "cycle-card"
        : go.settings === "couple"
          ? "couple-section"
          : undefined;
  requestSpotFocus(go.spot, topicId, fallbackSpot);
}

export function goToTopicGo(topicId: string) {
  const topic = findTopic(topicId);
  if (topic?.go) goToGo(topic.go, topicId);
}
