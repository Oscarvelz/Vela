/* Wave 0 fences — the solemn promises (prejudice hunt RT-V1 B-5, RT-V4 B1/B2/B5/B6).
 * Drives the REAL store actions and the REAL load gate with fake data only
 * (Ana / Lucía / Sofía / Marco; Cabin / Beach house / Hotel; Marta).
 * Every BREAK line below was watched failing on 2.2.21 before the fix. */
import { readFileSync } from "node:fs";
import type { Journal, Proposal } from "../src/lib/vela/types";

/* Bench shim: the app only ever runs in a browser; node has no window, and
 * one capability probe (fingerprint.ts) reads window.isSecureContext bare.
 * The store is imported dynamically, after the shim stands. */
const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
const { cleanProposals } = await import("../src/lib/vela/people");
const { journalFromUnknown, useJournal } = await import("../src/lib/vela/store");

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const DAY = 86400000;
const now = Date.now();

function rawJournal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { displayName: "Ana", createdAt: now - 30 * DAY },
    settings: {
      language: "en",
      coupleMode: { sharedFrom: "2026-10-01", enabledAt: now - 30 * DAY },
      cycles: [
        { id: "c1", starts: ["2026-10-05"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
        { id: "t-lucia", partnerName: "Lucía", starts: ["2026-10-07"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
      ],
      anniversaries: [{ id: "a1", label: "First trip", date: "2025-06-01", partnerName: "Lucía" }],
      children: [{ id: "k1", name: "Marta", birthDate: "2024-03-01" }],
      archivedPeople: [{ name: "Sofía", prefs: { showInHistory: false, showInStats: false, showInStories: false } }],
      storiesMuted: { people: ["Sofía"], days: [] },
      customPlaces: ["Hotel"],
      batchDraft: { text: "Oct 25 with Lucía, twice", at: now - DAY },
    },
    partners: ["Lucía", "Sofía"],
    sessions: [
      { id: "s-lucia-1", date: "2026-11-02", time: "21:00", partnerName: "Lucía", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "e-lucia", createdAt: now - 10 * DAY },
    ],
    encounters: [
      { id: "e-lucia", partnerName: "Lucía", title: "Cabin", startDate: "2026-11-02", endDate: "2026-11-02", notes: "", createdAt: now - 10 * DAY },
    ],
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY },
      { id: "p-lucia", name: "Lucía", role: "partner", pin: { salt: "c2FsdA==", hash: "aGFzaA==", iterations: 150000 }, createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY },
    ],
    quietDays: [{ id: "q1", from: "2026-10-10", to: "2026-10-12", reason: "travel", source: "manual", createdAt: now - 20 * DAY }],
    pregnancyTests: [{ id: "pt1", date: "2026-11-01", result: "positive", count: 1, evidence: "the pregnancy test was positive", createdAt: now - 9 * DAY }],
    ...extra,
  };
}

function seed(extra: Record<string, unknown> = {}): Journal {
  const j = journalFromUnknown(rawJournal(extra), "en");
  useJournal.setState({ journal: j, unlocked: true });
  return j;
}
const S = () => useJournal.getState();
const J = () => S().journal;

/* ── A. The gate: an approval is only as real as its second signature ── */
{
  const base = { id: "w1", kind: "wipe-vault" as const, proposedBy: "p-owner", proposedAt: now - 9 * DAY, expiresAt: now + DAY };
  const selfSigned = cleanProposals([{ ...base, state: "approved", decidedBy: "p-owner", decidedAt: now - 8 * DAY }]);
  if (selfSigned.length === 0) hold("A1 gate drops a self-approved wipe");
  else brk("A1 gate keeps a self-approved wipe", "cleanProposals let decidedBy === proposedBy through");
  const unsigned = cleanProposals([{ ...base, id: "w2", state: "approved", decidedAt: now - 8 * DAY }]);
  if (unsigned.length === 0) hold("A2 gate drops an approved wipe with no decider");
  else brk("A2 gate keeps an approved wipe with no decider");
  const legit = cleanProposals([{ ...base, id: "w3", state: "approved", decidedBy: "p-lucia", decidedAt: now - 8 * DAY }]);
  if (legit.length === 1) hold("A3 gate keeps a wipe approved by the other person");
  else brk("A3 gate dropped a legitimate approval");
  const lapsed = cleanProposals([{ id: "d1", kind: "delete-session", targetId: "s-lucia-1", proposedBy: "p-owner", proposedAt: now - 9 * DAY, expiresAt: now - DAY, state: "pending" }]);
  if (lapsed.length === 0) hold("A4 gate still drops a lapsed pending proposal");
  else brk("A4 gate kept a lapsed pending proposal");
}

/* ── B. decideProposal: consent is a person of the diary, in its week ── */
{
  seed();
  const pid = S().proposeDeletion({ kind: "delete-session", targetId: "s-lucia-1" }, "p-owner");
  S().decideProposal(pid, "p-stranger-who-is-nobody", true);
  if (J().sessions.some((s) => s.id === "s-lucia-1")) hold("B1 a stranger's consent executes nothing");
  else brk("B1 a fabricated third id consented and the session died");
}
{
  seed();
  const pid = S().proposeDeletion({ kind: "delete-session", targetId: "s-lucia-1" }, "p-owner");
  S().decideProposal(pid, "p-owner", true);
  if (J().sessions.some((s) => s.id === "s-lucia-1")) hold("B2 self-consent still refused");
  else brk("B2 self-consent executed");
}
{
  seed();
  const pid = S().proposeDeletion({ kind: "delete-session", targetId: "s-lucia-1" }, "p-owner");
  const aged: Proposal = { ...(J().proposals ?? []).find((p) => p.id === pid)!, proposedAt: now - 8 * DAY, expiresAt: now - DAY };
  useJournal.setState({ journal: { ...J(), proposals: [aged] } });
  S().decideProposal(pid, "p-lucia", true);
  if (J().sessions.some((s) => s.id === "s-lucia-1") && !(J().proposals ?? []).some((p) => p.id === pid))
    hold("B3 consent after caducity executes nothing and the proposal caduces at the act");
  else brk("B3 consent after caducity executed", `sessions=${J().sessions.length} proposals=${(J().proposals ?? []).length}`);
}
{
  seed();
  const pid = S().proposeDeletion({ kind: "delete-session", targetId: "s-lucia-1" }, "p-owner");
  S().decideProposal(pid, "p-lucia", true);
  if (!J().sessions.some((s) => s.id === "s-lucia-1")) hold("B4 the other person's consent still executes at once");
  else brk("B4 legitimate consent no longer executes");
}

/* ── C. executeWipe: the government of two, and a wipe that erases ── */
function seedWipe(proposal: Proposal): void {
  const j = seed();
  useJournal.setState({ journal: { ...j, proposals: [proposal, { id: "d-other", kind: "delete-session", targetId: "s-lucia-1", proposedBy: "p-lucia", proposedAt: now - DAY, expiresAt: now + 6 * DAY, state: "pending" }] }, unlocked: true });
}
{
  seedWipe({ id: "w-self", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - 9 * DAY, expiresAt: now - 2 * DAY, state: "approved", decidedBy: "p-owner", decidedAt: now - 8 * DAY });
  S().executeWipe("w-self");
  if (J().sessions.length === 1 && !(J().proposals ?? []).some((p) => p.id === "w-self"))
    hold("C1 a self-signed wipe is void at the act and leaves the inbox");
  else brk("C1 a self-signed wipe executed or still sits approved", `sessions=${J().sessions.length} proposals=${(J().proposals ?? []).length}`);
}
{
  seedWipe({ id: "w-legit", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - 9 * DAY, expiresAt: now - 2 * DAY, state: "approved", decidedBy: "p-lucia", decidedAt: now - 8 * DAY });
  S().executeWipe("w-legit");
  const j = J();
  const residue: string[] = [];
  if (j.profile) residue.push("profile");
  if (j.sessions.length) residue.push("sessions");
  if (j.encounters.length) residue.push("encounters");
  if (j.partners.length) residue.push("partners");
  if ((j.people ?? []).length) residue.push("people+PINs");
  if ((j.proposals ?? []).length) residue.push("proposals");
  if ((j.quietDays ?? []).length) residue.push("quietDays");
  if ((j.pregnancyTests ?? []).length) residue.push("pregnancyTests");
  // The wipe ends locked on the fresh shell, whose settings materialize the
  // dormant empty tracker every new diary gets — what must NOT survive is
  // cycle DATA: no starts, no reasons, no marked days on any tracker.
  if (j.settings.cycles.some((tr) => (tr.starts ?? []).length > 0 || Object.keys(tr.reasons ?? {}).length > 0 || Object.keys(tr.days ?? {}).length > 0)) residue.push("cycle data");
  if ((j.settings.anniversaries ?? []).length) residue.push("anniversaries");
  if ((j.settings.children ?? []).length) residue.push("children");
  if ((j.settings.archivedPeople ?? []).length) residue.push("archivedPeople");
  if (j.settings.coupleMode) residue.push("coupleMode");
  if ((j.settings.customPlaces ?? []).length) residue.push("customPlaces");
  if (j.settings.batchDraft) residue.push("batchDraft");
  if (residue.length === 0 && S().unlocked === false) hold("C2 a both-signed wipe erases the whole diary and locks");
  else brk("C2 the wipe left residue", residue.join(", ") + (S().unlocked ? " + still unlocked" : ""));
}

/* ── F. forgetDevice completes its promise (source fence; the bench
 *      scenario v1-scen-forget remains the end-to-end proof) ── */
{
  const src = readFileSync("src/lib/vela/store.ts", "utf8");
  const start = src.indexOf("forgetDevice: async");
  const body = src.slice(start, src.indexOf("setTab:", start));
  if (body.includes("removeLegacyJournal()")) hold("F1 forgetDevice removes the legacy plaintext journal");
  else brk("F1 forgetDevice never calls removeLegacyJournal", "the plaintext diary survives the forget");
}

console.log(`\nWAVE0-STORE: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
