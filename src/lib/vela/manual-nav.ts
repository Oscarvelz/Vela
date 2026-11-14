/* Manual navigation: «Ver en la app» and the dotted [[Name]] doors.
 * A go closes the manual, drives the store to the place (tab, Settings
 * section, cycle sheet), then asks the SpotFocus runner to light the
 * living control — by its data-spot token, falling back to the topic's
 * own (?) bubble. The request is one-shot and lives only in memory:
 * the manual is interface, not journal data. */
import { useJournal } from "./store";
import { findTopic, type Go } from "./manual";

export type SpotRequest = { spot?: string; topicId?: string; at: number };
let pending: SpotRequest | null = null;
const listeners = new Set<() => void>();

export function requestSpotFocus(spot: string | undefined, topicId?: string) {
  pending = { spot, topicId, at: Date.now() };
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
    if (go.settings && !s.sections[go.settings]) s.toggleSection(go.settings);
  } else if (go.tab) {
    s.setSettingsOpen(false);
    s.setTab(go.tab);
  }
  if (go.cycleSheet) s.setCycleSheet(true);
  requestSpotFocus(go.spot, topicId);
}

export function goToTopicGo(topicId: string) {
  const topic = findTopic(topicId);
  if (topic?.go) goToGo(topic.go, topicId);
}
