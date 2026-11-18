/* WAVE11-ERASURE — Round 3 Wave 1 (2.2.34): erasure & the stamp economy
 * (RT3-H1 B1/B2/B3/B4/B6/B7, RT3-H6 B1). The disease: the wipe's armor
 * enumerates the ids the wiping device held instead of cutting time, so
 * a divergent stale device resurrects every class it alone carries;
 * the profile and people screens key on the wrong stamp; the solemn
 * erasures mint their stamps from the raw clock, so a future-dated
 * record sits above the cut; and the gate admits non-finite stamps,
 * one of which disarms every tombstone the store mints afterwards.
 * Fake data only. Run: node ../run-ts-test.mjs tests/wave11-erasure.ts */
const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
const { journalFromUnknown, mergeJournals, useJournal, stampNow } = await import("../src/lib/vela/store");
const { wipedJournal } = await import("../src/lib/vela/wipe");
import type { Journal } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }
function check(name: string, ok: boolean, extra = "") { if (ok) hold(name); else brk(name, extra); }

const DAY = 86400000;
const T0 = Date.now();
const S = () => useJournal.getState();
const J = () => S().journal;

function base(at: number): Journal {
  return journalFromUnknown({
    profile: { displayName: "Ana", createdAt: at - 30 * DAY },
    updatedAt: at - DAY,
    settings: { language: "en" },
    partners: ["Lucía"],
    sessions: [
      { id: "s1", date: "2026-11-02", time: "21:00", partnerName: "Lucía", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: at - 10 * DAY },
    ],
    encounters: [],
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: at - 30 * DAY, updatedAt: at - 30 * DAY },
      { id: "p-lucia", name: "Lucía", role: "partner", createdAt: at - 30 * DAY, updatedAt: at - 30 * DAY },
    ],
    proposals: [],
    quietDays: [],
    pregnancyTests: [],
  }, "en");
}

/* ── S1. The wipe cuts TIME for the settings unions (B1: anniversaries, children) ── */
{
  const TW = T0;
  const wiped = wipedJournal(base(TW - DAY), TW);
  const stale = base(TW - DAY);
  stale.settings.anniversaries = [
    { id: "a-x", label: "Hers", monthDay: "06-01", kind: "custom", milestone: false, createdAt: TW - 20 * DAY },
    { id: "a-post", label: "After", monthDay: "07-01", kind: "custom", milestone: false, createdAt: TW + DAY },
  ];
  stale.settings.children = [
    { id: "k-x", name: "Marta", birthdate: "2024-03-01", refAs: "daughter", createdAt: TW - 20 * DAY },
    { id: "k-post", name: "New", birthdate: "2026-11-01", refAs: "child", createdAt: TW + DAY },
  ];
  const m = mergeJournals(wiped, stale);
  check("S1 pre-wipe anniversary stays wiped", !m.settings.anniversaries.some((a) => a.id === "a-x"));
  check("S1 pre-wipe child stays wiped", !m.settings.children.some((c) => c.id === "k-x"));
  check("S1 post-wipe anniversary survives", m.settings.anniversaries.some((a) => a.id === "a-post"));
  check("S1 post-wipe child survives", m.settings.children.some((c) => c.id === "k-post"));
}

/* ── S2. The wipe cuts TIME for quiet marks and pregnancy tests (B1) ── */
{
  const TW = T0;
  const wiped = wipedJournal(base(TW - DAY), TW);
  const stale = base(TW - DAY);
  stale.quietDays = [
    { id: "q-x", from: "2026-10-10", to: "2026-10-12", reason: "travel", source: "manual", createdAt: TW - 20 * DAY, updatedAt: TW - 20 * DAY },
    { id: "q-post", from: "2026-11-20", to: "2026-11-21", reason: "travel", source: "manual", createdAt: TW + DAY, updatedAt: TW + DAY },
  ];
  stale.pregnancyTests = [
    { id: "pt-x", date: "2026-11-01", result: "positive", count: 1, evidence: "the pregnancy test was positive", createdAt: TW - 9 * DAY },
    { id: "pt-post", date: "2026-11-19", result: "negative", count: 1, evidence: "the pregnancy test was negative", createdAt: TW + DAY },
  ];
  const m = mergeJournals(wiped, stale);
  check("S2 pre-wipe quiet mark stays wiped", !(m.quietDays ?? []).some((q) => q.id === "q-x"));
  check("S2 pre-wipe pregnancy test stays wiped", !(m.pregnancyTests ?? []).some((t) => t.id === "pt-x"));
  check("S2 post-wipe quiet mark survives", (m.quietDays ?? []).some((q) => q.id === "q-post"));
  check("S2 post-wipe pregnancy test survives", (m.pregnancyTests ?? []).some((t) => t.id === "pt-post"));
}

/* ── S3. The wipe cuts TIME for customs and mutes (B1: the value classes) ── */
{
  const TW = T0;
  const wiped = wipedJournal(base(TW - DAY), TW);
  const stale = base(TW - DAY);
  stale.settings.customPlaces = ["Beach house", "Cabin"];
  stale.settings.storiesMuted = { people: ["Sofía", "Marco"], days: [] };
  stale.deleted = {
    ...(stale.deleted ?? {}),
    "custom+:places:Cabin": TW + DAY,
    "mute+:person:marco": TW + DAY,
  };
  const m = mergeJournals(wiped, stale);
  check("S3 unstamped pre-wipe custom stays wiped", !m.settings.customPlaces.includes("Beach house"));
  check("S3 post-wipe custom survives", m.settings.customPlaces.includes("Cabin"));
  check("S3 unstamped pre-wipe mute stays wiped", !(m.settings.storiesMuted?.people ?? []).includes("Sofía"));
  check("S3 post-wipe mute survives", (m.settings.storiesMuted?.people ?? []).includes("Marco"));
}

/* ── S4. The wipe cuts TIME for trackers (B1: birth witness = earliest stamp) ── */
{
  const TW = T0;
  const wiped = wipedJournal(base(TW - DAY), TW);
  const stale = base(TW - DAY);
  const tracker = (id: string, stamps: Record<string, number>, at: number) => ({
    id, starts: ["2026-10-09"], ends: {}, days: {}, reasons: {}, stamps,
    enabled: true, updatedAt: at, metaAt: at,
  });
  stale.settings.cycles = [
    tracker("t-x", { "s:2026-10-09": TW - 50 * DAY }, TW - 10 * DAY),
    tracker("t-post", { "s:2026-10-09": TW + 50 * DAY }, TW + 60 * DAY),
  ] as Journal["settings"]["cycles"];
  const m = mergeJournals(wiped, stale);
  check("S4 pre-wipe tracker stays wiped", !m.settings.cycles.some((t) => t.id === "t-x"));
  check("S4 post-wipe tracker survives", m.settings.cycles.some((t) => t.id === "t-post"));
}

/* ── S5. The profile screen reads the PROFILE's stamp (B2) ── */
{
  const TW = T0;
  const wiped = wipedJournal(base(TW - DAY), TW);
  const touched = base(TW - DAY);
  touched.updatedAt = TW + DAY; // merely touched after the wipe
  const m1 = mergeJournals(wiped, touched);
  check("S5 erased profile stays erased after a mere touch", m1.profile === null);
  const reborn = base(TW - DAY);
  reborn.profile = { displayName: "Ana", createdAt: TW + DAY };
  reborn.updatedAt = TW + DAY;
  const m2 = mergeJournals(wiped, reborn);
  check("S5 post-wipe profile is a new life", m2.profile?.displayName === "Ana");
}

/* ── S6. The people screen reads the person's BIRTH stamp (B3) ── */
{
  const TW = T0;
  const wiped = wipedJournal(base(TW - DAY), TW);
  const edited = base(TW - DAY);
  edited.people = (edited.people ?? []).map((p) => (p.id === "p-lucia" ? { ...p, updatedAt: TW + DAY } : p));
  edited.updatedAt = TW + DAY;
  const m1 = mergeJournals(wiped, edited);
  check("S6 wiped person stays wiped after a post-wipe edit", !(m1.people ?? []).some((p) => p.id === "p-lucia"));
  const joined = base(TW - DAY);
  joined.people = [...(joined.people ?? []), { id: "p-new", name: "Marco", role: "partner" as const, createdAt: TW + DAY, updatedAt: TW + DAY }];
  const m2 = mergeJournals(wiped, joined);
  check("S6 person born after the wipe survives", (m2.people ?? []).some((p) => p.id === "p-new"));
}

/* ── S7. executeWipe mints its cut through stampNow (B4: future-dated session) ── */
{
  const j = base(T0);
  j.sessions = [...j.sessions, { ...j.sessions[0], id: "s-future", createdAt: T0 + 200 * DAY }];
  j.proposals = [{
    id: "pw", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: T0 - 40 * DAY,
    decidedBy: "p-lucia", decidedAt: T0 - 30 * DAY, expiresAt: T0 + 300 * DAY, state: "approved",
  }];
  useJournal.setState({ journal: j, unlocked: true });
  const seen: Journal[] = [];
  const unsub = useJournal.subscribe((state) => { seen.push(state.journal); });
  S().executeWipe("pw");
  unsub();
  // executeWipe commits the wiped journal and then locks (the lock swaps
  // in the shell) — the wiped journal is the committed state that carries
  // the cut, captured here through the subscription.
  const wipedJ = seen.find((x) => (x.clearedAt ?? 0) > 0) ?? J();
  check("S7 wipe emptied the diary locally", wipedJ.sessions.length === 0);
  const m = mergeJournals(wipedJ, j);
  check("S7 future-dated session stays wiped through the merge", !m.sessions.some((s) => s.id === "s-future"), `cut=${wipedJ.clearedAt} created=${T0 + 200 * DAY}`);
}

/* ── S8. eraseAll mints its cuts through stampNow (B4) ── */
{
  const j = base(T0);
  j.sessions = [...j.sessions, { ...j.sessions[0], id: "s-future", createdAt: T0 + 200 * DAY }];
  useJournal.setState({ journal: j, unlocked: true });
  S().eraseAll({ sessions: true, encounters: true, partners: true, places: true, positions: true, problems: true });
  const erased = J();
  const m = mergeJournals(erased, j);
  check("S8 future-dated session stays erased through the merge", !m.sessions.some((s) => s.id === "s-future"), `cut=${erased.sessionsClearedAt}`);
}

/* ── S9. Cancelled and declined proposals tombstone through stampNow (B6) ── */
{
  const mk = (id: string) => ({
    id, kind: "delete-session" as const, targetId: "s1", proposedBy: "p-owner",
    proposedAt: T0 + 200 * DAY, expiresAt: T0 + 207 * DAY, state: "pending" as const,
  });
  const j1 = base(T0);
  j1.proposals = [mk("pf-cancel")];
  useJournal.setState({ journal: j1, unlocked: true });
  S().cancelProposal("pf-cancel");
  const m1 = mergeJournals(J(), j1);
  check("S9 cancelled future proposal stays cancelled", !(m1.proposals ?? []).some((p) => p.id === "pf-cancel"));
  const j2 = base(T0);
  j2.proposals = [mk("pf-decline")];
  useJournal.setState({ journal: j2, unlocked: true });
  S().decideProposal("pf-decline", "p-lucia", false);
  const m2 = mergeJournals(J(), j2);
  check("S9 declined future proposal stays declined", !(m2.proposals ?? []).some((p) => p.id === "pf-decline"));
}

/* ── S10. The partner re-add stamp outranks the removal, clock or no clock (B7) ── */
{
  const realNow = Date.now;
  const j = base(T0);
  j.partners = [];
  j.deleted = { ...(j.deleted ?? {}), "partner-:lucía": T0 + 40 * DAY };
  j.sessions = [...j.sessions, { ...j.sessions[0], id: "s-future", createdAt: T0 + 40 * DAY }];
  useJournal.setState({ journal: j, unlocked: true });
  Date.now = () => T0 + 10 * DAY; // the clock was set back before the re-add
  try { S().addPartner("Lucía"); } finally { Date.now = realNow; }
  const on = J().deleted?.["partner+:lucía"] ?? 0;
  const off = J().deleted?.["partner-:lucía"] ?? 0;
  check("S10 re-add stamp beats the removal stamp", on > off, `on=${on} off=${off}`);
  const other = base(T0);
  other.partners = [];
  other.deleted = { "partner-:lucía": T0 + 40 * DAY };
  const m = mergeJournals(J(), other);
  check("S10 re-added partner survives the merge", m.partners.includes("Lucía"));
}

/* ── S11. The gate admits no non-finite stamp (RT3-H6 B1) ── */
{
  const raw = {
    profile: { displayName: "Ana", createdAt: Infinity },
    updatedAt: T0,
    clearedAt: Infinity,
    settings: {
      language: "en",
      anniversaries: [{ id: "a-inf", label: "X", monthDay: "06-01", kind: "custom", milestone: false, createdAt: Infinity }],
      children: [{ id: "k-inf", name: "Marta", birthdate: "2024-03-01", refAs: "daughter", createdAt: Infinity }],
      coupleMode: { sharedFrom: "2026-10-01", enabledAt: Infinity },
      batchDraft: { text: "x", picked: "", typed: "", edits: {}, open: null, at: Infinity },
      cycles: [{ id: "c1", starts: [], ends: {}, days: {}, reasons: {}, stamps: { "s:2026-10-09": Infinity }, enabled: true, updatedAt: Infinity, metaAt: Infinity }],
    },
    partners: [],
    sessions: [{ id: "s-inf", date: "2026-11-02", partnerName: "Ana", place: "", durationMins: 0, positions: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 0, notes: "", ownWords: "", createdAt: Infinity, updatedAt: Infinity }],
    encounters: [{ id: "e-inf", partnerName: "Ana", title: "", startDate: "2026-11-02", endDate: "2026-11-02", notes: "", createdAt: Infinity }],
    people: [{ id: "p-inf", name: "Ana", role: "owner", createdAt: Infinity, updatedAt: Infinity }],
    proposals: [{ id: "pr-inf", kind: "delete-session", targetId: "s1", proposedBy: "p-inf", proposedAt: Infinity, expiresAt: Infinity, state: "pending" }],
    quietDays: [{ id: "q-inf", from: "2026-10-10", to: "2026-10-12", reason: "travel", source: "manual", createdAt: Infinity, updatedAt: Infinity }],
    pregnancyTests: [{ id: "pt-inf", date: "2026-11-01", result: "positive", count: 1, evidence: "x", createdAt: Infinity }],
    deleted: { "some-id": Infinity },
  };
  const j = journalFromUnknown(raw, "en");
  const stamps: [string, number | undefined][] = [
    ["profile.createdAt", j.profile?.createdAt],
    ["clearedAt", j.clearedAt],
    ["anniversary.createdAt", j.settings.anniversaries[0]?.createdAt],
    ["child.createdAt", j.settings.children[0]?.createdAt],
    ["coupleMode.enabledAt", j.settings.coupleMode?.enabledAt],
    ["batchDraft.at", j.settings.batchDraft?.at],
    ["tracker.updatedAt", j.settings.cycles[0]?.updatedAt],
    ["tracker.metaAt", j.settings.cycles[0]?.metaAt],
    ["tracker.stamp", j.settings.cycles[0]?.stamps["s:2026-10-09"]],
    ["session.createdAt", j.sessions[0]?.createdAt],
    ["session.updatedAt", j.sessions[0]?.updatedAt],
    ["encounter.createdAt", j.encounters[0]?.createdAt],
    ["person.createdAt", j.people?.[0]?.createdAt],
    ["person.updatedAt", j.people?.[0]?.updatedAt],
    ["proposal.proposedAt", j.proposals?.[0]?.proposedAt],
    ["proposal.expiresAt", j.proposals?.[0]?.expiresAt],
    ["quiet.createdAt", j.quietDays?.[0]?.createdAt],
    ["quiet.updatedAt", j.quietDays?.[0]?.updatedAt],
    ["test.createdAt", j.pregnancyTests?.[0]?.createdAt],
    ["deleted value", j.deleted?.["some-id"]],
  ];
  const bad = stamps.filter(([, v]) => v !== undefined && !Number.isFinite(v)).map(([n]) => n);
  check("S11 every admitted stamp is finite", bad.length === 0, bad.join(", "));
}

/* ── S12. The Infinity chain dies: a deletion stays deleted (RT3-H6 B1) ── */
{
  const raw = base(T0) as unknown as Record<string, unknown>;
  const sessions = raw.sessions as Record<string, unknown>[];
  sessions.push({ id: "s-inf", date: "2026-11-03", partnerName: "Ana", place: "", durationMins: 0, positions: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 0, notes: "", ownWords: "", createdAt: Infinity });
  const j = journalFromUnknown(raw, "en");
  useJournal.setState({ journal: j, unlocked: true });
  S().deleteSession("s1");
  const afterDelete = J();
  const roundTripped = journalFromUnknown(JSON.parse(JSON.stringify(afterDelete)), "en");
  const m = mergeJournals(roundTripped, j);
  check("S12 deleted session stays deleted after the poisoned journal round-trips", !m.sessions.some((s) => s.id === "s1"));
  check("S12 stampNow stays finite on the gated journal", Number.isFinite(stampNow(j)));
}

console.log(`WAVE11-ERASURE: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
