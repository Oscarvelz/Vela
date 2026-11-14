import type { BatchEntry } from "./batch";
import type { Mode, RatingStyle, ThemeId, WeekStart } from "./catalog";
import type { CycleSettings } from "./cycle";
import type { CycleTracker } from "./cycle-trackers";
import type { Lang } from "./copy";

/**
 * The batch sheet's work in progress, kept inside the encrypted journal: the pasted text,
 * the partner choices and every card edit. Leaving mid-import — the app locking, the phone
 * killing the page, anything — must never cost the work (Oscar, Nov 9 2026: he switched apps
 * mid-import and came back to a locked, emptied sheet). Cleared when the batch is saved or
 * the sheet is cleared by hand.
 */
export type BatchDraft = {
  text: string;
  picked: string;
  typed: string;
  edits: Record<string, Partial<BatchEntry> & { skip?: boolean }>;
  open: string | null;
  at: number;
};

/** What Stories must never show again (2.1.23): partner names that stop
 *  resurfacing entirely, and single source dates hidden one by one. */
export type StoryMuted = {
  people: string[];
  days: string[];
};

/** How Vela should speak about the user (2.1.24) — a grammar fact, nothing
 *  more: it exists so Spanish can say "casado" or "casada" correctly and the
 *  Advisor can address its reader. Neutral is the default and always valid. */
export type SpeakAs = "man" | "woman" | "neutral";

export type AnniversaryKind = "met" | "married" | "first" | "custom";

/** A date the user chose never to forget (2.1.24). It recurs every year on
 *  monthDay; `year` is the year it began, when known — without it the date
 *  still recurs, it simply carries no counter. */
export type Anniversary = {
  id: string;
  label: string;
  monthDay: string;
  year?: number;
  personName?: string;
  kind: AnniversaryKind;
  /** The sacred ones. The user marks them; the app never guesses. */
  milestone: boolean;
  note?: string;
  createdAt: number;
};

export type ChildRef = "son" | "daughter" | "child";

/** A child in the People's roster (2.1.24) — name and birthdate only: that is
 *  all a birthday and an age counter need, and all the vault should hold. */
export type ChildEntry = {
  id: string;
  name: string;
  birthdate: string;
  refAs: ChildRef;
  createdAt: number;
};

/** A person at rest (2.1.24, the Archive law): archived, never erased, and
 *  the user — only the user — decides where their traces still appear. */
export type ArchivedPerson = {
  name: string;
  archivedAt: number;
  showInHistory: boolean;
  countInStats: boolean;
  resurface: boolean;
};

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
  /** The batch sheet's unsaved work, so an interruption never costs an import in progress. */
  batchDraft?: BatchDraft;
  /** Stories the user has put away: people who never resurface, and single days
   *  (source dates) hidden for good. Revived only by the user, in Settings. */
  storiesMuted?: StoryMuted;
  /** Dates the user chose never to forget (2.1.24), shown in History. */
  anniversaries?: Anniversary[];
  /** The children of the house (2.1.24): their birthdays join the dates. */
  children?: ChildEntry[];
  /** People at rest in the Archive (2.1.24): honored, kept, and quiet where
   *  the user decided they should be quiet. */
  archivedPeople?: ArchivedPerson[];
  /** Couple mode (2.2): present only once the owner has turned it on in its
   *  ceremony. sharedFrom is the first day the diary counts as shared —
   *  entries before it stay governed by the owner's voice alone. */
  coupleMode?: { sharedFrom: string; enabledAt: number };
};

export type Profile = {
  displayName: string;
  createdAt: number;
  /** How Vela speaks about the user (2.1.24). Absent = neutral. */
  speakAs?: SpeakAs;
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
  /** The second voice (2.2, couple mode): the partner's own reading of this
   *  same moment, written blind and revealed beside the owner's. Absent means
   *  she has not spoken — forever distinguishable from a voice of zeros. */
  partnerVoice?: Voice;
};

/** One person's reading of a shared moment: her five dials and her words.
 *  The entry itself (date, place, positions, problems) stays shared fact;
 *  only the reading is personal — and only she may write or erase it. */
export type Voice = {
  intensity: number;
  connection: number;
  satisfaction: number;
  energy: number;
  overall: number;
  ownWords: string;
  /** Her note, composed from her dials by the same writer as the owner's. */
  notes: string;
  /** Person id of the author (see Person). */
  by: string;
  updatedAt: number;
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

/** A person of the diary (2.2). Solo journals have no people list at all:
 *  the list is born in the couple-mode ceremony, seeded with the owner and
 *  the partner. A PIN is an attribution signature inside an already-open
 *  journal — a salted hash, never the PIN itself — not an encryption key. */
export type Person = {
  id: string;
  name: string;
  role: "owner" | "partner";
  speakAs?: SpeakAs;
  pin?: { salt: string; hash: string; iterations: number };
  createdAt: number;
  updatedAt: number;
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
  /** The people of the diary (2.2, couple mode). Journal-level on purpose:
   *  merges take settings wholesale, but people merge by id, per person. */
  people?: Person[];
  /** Shared-erasure proposals (2.2.3): what belongs to both is erased only
   *  by both. A proposal the other partner declines or lets lapse is removed
   *  outright — it leaves no scar in the journal. */
  proposals?: Proposal[];
};

/** A request to erase something shared. Consent comes from the OTHER
 *  person; a wipe of the whole vault, once approved by both, waits out a
 *  cooling-off before it can be carried out, and either person can cancel
 *  it until the moment it runs. */
export type Proposal = {
  id: string;
  kind: "delete-session" | "delete-encounter" | "delete-person" | "wipe-vault";
  targetId?: string;
  /** What is being proposed, in words (a date, a name) — consent is never blind. */
  targetLabel?: string;
  proposedBy: string;
  proposedAt: number;
  state: "pending" | "approved";
  decidedBy?: string;
  decidedAt?: number;
  expiresAt: number;
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
