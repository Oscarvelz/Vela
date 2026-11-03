import type { Mode, RatingStyle, ThemeId, WeekStart } from "./catalog";
import type { CycleSettings } from "./cycle";
import type { CycleTracker } from "./cycle-trackers";
import type { Lang } from "./copy";

export type Settings = {
  theme: ThemeId;
  mode: Mode;
  weekStart: WeekStart;
  discreet: boolean;
  autoLockMins: number;
  ratingStyle: RatingStyle;
  language: Lang;
  customPlaces: string[];
  customPositions: string[];
  customProblems: string[];
  defaultPartner: string;
  /** Legacy single cycle: mirror of cycles[0], kept so older builds still read a valid cycle. */
  cycle: CycleSettings;
  /** Cycle trackers (own cycle and/or partners'), each with its own history. Source of truth. */
  cycles: CycleTracker[];
  /** Tracker shown on the cycle card, header pill and calendar (last one picked). */
  cycleSelected: string;
  /** 2 = Firmament became the default theme (Oct 31, 2026). */
  themeVersion?: number;
};

export type Profile = {
  displayName: string;
  createdAt: number;
};

export type Session = {
  id: string;
  createdAt: number;
  partnerName: string;
  date: string;
  time: string;
  place: string;
  durationMins: number;
  positions: string[];
  intensity: number;
  connection: number;
  satisfaction: number;
  energy: number;
  overall: number;
  notes: string;
  ownWords: string;
  contraception: string[];
  problems: string[];
  sessionNumber: number;
  encounterId: string;
  updatedAt?: number;
};

export type Encounter = {
  id: string;
  createdAt: number;
  title: string;
  startDate: string;
  endDate: string;
  partnerName: string;
  comment: string;
  problems: string[];
  updatedAt?: number;
};

export type Journal = {
  profile: Profile | null;
  settings: Settings;
  partners: string[];
  sessions: Session[];
  encounters: Encounter[];
  updatedAt: number;
  clearedAt?: number;
  sessionsClearedAt?: number;
  encountersClearedAt?: number;
  partnersClearedAt?: number;
  /** Deletion markers (item id → time) so a deleted item is not revived by a merge. */
  deleted?: Record<string, number>;
  /** One-time data migrations already applied to this journal (e.g. "enc-split-1"). */
  migrations?: string[];
};

export type JournalWipe = {
  sessions: boolean;
  encounters: boolean;
  partners: boolean;
  places: boolean;
  positions: boolean;
  problems: boolean;
};

export type Draft = {
  date: string;
  time: string;
  partnerName: string;
  newPartner: string;
  place: string;
  customPlace: string;
  durationMins: number;
  positions: string[];
  intensity: number;
  connection: number;
  satisfaction: number;
  energy: number;
  overall: number;
  ownWords: string;
  prevNote: string;
  contraception: string[];
  problems: string[];
  encounterId: string;
  encounterTitle: string;
  encounterStart: string;
  encounterEnd: string;
  encounterProblems: string[];
};

export type TabId = "home" | "calendar" | "history" | "insights";

export const RATING_KEYS = ["intensity", "connection", "satisfaction", "energy"] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
