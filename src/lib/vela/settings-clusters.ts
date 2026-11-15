/* Settings clusters (2.2.9): the fourteen sections live under five named
 * areas, so the main Settings screen stays short and related things are
 * found together. The map is the single source both the Settings view and
 * the manual's doors read: a door that opens a section also opens its
 * cluster. Section ids and their contents never changed — only the roof
 * over them is new. */
export const SECTION_CLUSTER: Record<string, string> = {
  language: "cl-personal",
  profile: "cl-personal",
  appearance: "cl-personal",
  prefs: "cl-personal",
  partners: "cl-people",
  places: "cl-people",
  memories: "cl-people",
  archive: "cl-people",
  couple: "cl-cycle",
  cycle: "cl-cycle",
  privacy: "cl-privacy",
  data: "cl-privacy",
  manual: "cl-help",
  android: "cl-help",
};
