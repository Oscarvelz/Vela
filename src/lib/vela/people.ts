import { finiteStamp } from "./dates";
import type { Person, Proposal, SpeakAs } from "./types";

/**
 * The people of the diary (2.2, couple mode).
 *
 * A person's PIN is an attribution signature inside an already-open journal:
 * it proves the person signing on this device knew their PIN at that moment.
 * It is NOT an encryption boundary — the vault still opens with the one
 * account passphrase, for both voices alike; a shared account has no secrets
 * inside it, and the ceremony says so. The PIN is stored only as a salted
 * PBKDF2-SHA256 hash inside the encrypted journal, so it syncs inside the
 * sealed blob and verifies locally on either partner's device.
 */

const PIN_ITERATIONS = 150_000;

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(text: string): Uint8Array {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function derivePin(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<NonNullable<Person["pin"]>> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePin(pin, salt, PIN_ITERATIONS);
  return { salt: toB64(salt), hash: toB64(hash), iterations: PIN_ITERATIONS };
}

/** The work factor is part of the PIN's promise: hashPin writes 150k, and
 *  a stored record claiming anything far outside this band is foreign —
 *  1 iteration would make the PIN brute-forceable, 10^9 would hang the
 *  phone. Out-of-band records lose their PIN at the gate and are refused
 *  at verification, however they arrived (prejudice hunt RT-V4 B13). */
export const PIN_ITERATIONS_MIN = 10_000;
export const PIN_ITERATIONS_MAX = 600_000;

export function pinIterationsInBand(iterations: unknown): iterations is number {
  return typeof iterations === "number" && Number.isFinite(iterations) && iterations >= PIN_ITERATIONS_MIN && iterations <= PIN_ITERATIONS_MAX;
}

export async function verifyPin(person: Person | undefined, pin: string): Promise<boolean> {
  if (!person?.pin || !pin) return false;
  if (!pinIterationsInBand(person.pin.iterations)) return false;
  try {
    const derived = await derivePin(pin, fromB64(person.pin.salt), person.pin.iterations);
    const expected = fromB64(person.pin.hash);
    if (derived.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/* ── Cleaners (the anniversaries.ts pattern: settings and journals arrive as
 *    unknown; every list is rebuilt defensively or dropped). ──────────────── */

const SPEAK_AS: SpeakAs[] = ["man", "woman", "neutral"];

export function cleanPeople(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return [];
  const out: Person[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<Person>;
    if (typeof p.id !== "string" || !p.id) continue;
    if (typeof p.name !== "string" || !p.name.trim()) continue;
    if (p.role !== "owner" && p.role !== "partner") continue;
    // Dedupe on the STORED id, not the raw one: two raw ids sharing a
    // 40-char prefix used to pass the check separately and then
    // truncate into the same person, and the merge kept only one of
    // them (RT2-H6-4). First record wins, as at every other gate —
    // with one exception (RT3-H6 B5): when the collision costs the
    // OWNER her seat, the owner wins it, whichever order the records
    // arrived in. Losing a partner record to the band is the stated
    // truncation; losing the owner leaves ownerPerson() nobody.
    const id = p.id.slice(0, 40);
    if (seen.has(id)) {
      const at = out.findIndex((q) => q.id === id);
      if (at >= 0 && out[at].role !== "owner" && p.role === "owner") {
        out.splice(at, 1);
      } else {
        continue;
      }
    }
    seen.add(id);
    out.push({
      id,
      name: p.name.trim().slice(0, 60),
      role: p.role,
      ...(p.speakAs && SPEAK_AS.includes(p.speakAs) ? { speakAs: p.speakAs } : {}),
      ...(p.pin &&
      typeof p.pin === "object" &&
      typeof p.pin.salt === "string" &&
      typeof p.pin.hash === "string" &&
      pinIterationsInBand(p.pin.iterations)
        ? { pin: { salt: p.pin.salt, hash: p.pin.hash, iterations: p.pin.iterations } }
        : {}),
      createdAt: finiteStamp(p.createdAt) ?? Date.now(),
      updatedAt: finiteStamp(p.updatedAt) ?? 0,
    });
  }
  return resolvePeople(out);
}

/**
 * The couple is two people. When more than two records compete (two devices
 * each paired with someone, a tampered blob), the resolution is the same on
 * every device and never depends on array order: the owner first, then the
 * earliest ceremony (createdAt), then id (prejudice hunt V4 B7).
 */
export function resolvePeople(people: Person[]): Person[] {
  const rank = (p: Person) => (p.role === "owner" ? 0 : 1);
  return [...people]
    .sort((x, y) => rank(x) - rank(y) || x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1))
    .slice(0, 2);
}

export function ownerPerson(people: Person[] | undefined): Person | undefined {
  return (people ?? []).find((p) => p.role === "owner");
}

export function partnerPerson(people: Person[] | undefined): Person | undefined {
  return (people ?? []).find((p) => p.role === "partner");
}

/** People merge by id (2.2): for the same person, the newer record wins.
 *  A tombstoned record (deleted at or after its last change) never
 *  resurfaces, and a union over the couple's two seats resolves through
 *  resolvePeople — deterministically, identically on every device. */
export function mergePeople(
  local: Person[] | undefined,
  remote: Person[] | undefined,
  deleted?: Record<string, number>,
): Person[] | undefined {
  const a = local ?? [];
  const b = remote ?? [];
  if (!a.length && !b.length) return undefined;
  const byId = new Map<string, Person>();
  for (const p of [...a, ...b]) {
    if (deleted && (deleted[p.id] ?? 0) > 0 && (deleted[p.id] ?? 0) >= p.updatedAt) continue;
    const prev = byId.get(p.id);
    if (!prev || p.updatedAt > prev.updatedAt) { byId.set(p.id, p); continue; }
    if (p.updatedAt === prev.updatedAt) {
      /* An exact tie resolves by content, never by argument order
       * (Round 4, RT4-H6 B4): the displaced field in the convicted
       * specimen was a PIN, so a copy carrying one beats one
       * without; beyond that, the greater serialization wins —
       * identically on both devices. */
      const pinRank = (x: Person) => (x.pin ? 1 : 0);
      if (pinRank(p) > pinRank(prev) || (pinRank(p) === pinRank(prev) && JSON.stringify(p) > JSON.stringify(prev))) byId.set(p.id, p);
    }
  }
  return resolvePeople([...byId.values()]);
}

export function newPersonId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/* Deterministic re-seat ids for the collision repair (Round 4,
 * RT4-H6 L5): a repair computed independently on two devices — at
 * the gate on one, at the merge on the other — must land on the
 * SAME fresh id, or the repaired person forks into two records.
 * The fresh id is a pure function of the record being re-seated,
 * so every door derives it identically. */
function hash36(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
export function reseatPersonId(person: { id: string; name: string; createdAt: number }): string {
  return `p${hash36(`${person.id}:${person.createdAt}:${person.name}`)}`;
}
export function reseatRecordId(prefix: string, rec: { id: string; createdAt?: number }): string {
  return `${prefix}${hash36(`${rec.id}:${rec.createdAt ?? 0}`)}`;
}

/* ── Proposals (2.2.3) ────────────────────────────────────────────────────── */

export const PROPOSAL_TTL_MS = 7 * 86400000;
/** After both partners approve erasing the whole vault, a week must pass
 *  before it can be carried out — and either of them can cancel meanwhile. */
export const WIPE_COOLING_MS = 7 * 86400000;

export function newProposalId(): string {
  return `prop-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const PROPOSAL_KINDS = ["delete-session", "delete-encounter", "delete-person", "wipe-vault"] as const;

export function cleanProposals(raw: unknown, people?: readonly { id: string }[]): Proposal[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out: Proposal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<Proposal>;
    if (typeof p.id !== "string" || !p.id) continue;
    if (!PROPOSAL_KINDS.includes(p.kind as (typeof PROPOSAL_KINDS)[number])) continue;
    const proposedAt = finiteStamp(p.proposedAt);
    const expiresAt = finiteStamp(p.expiresAt);
    if (typeof p.proposedBy !== "string" || proposedAt === undefined || expiresAt === undefined) continue;
    // Membership is not arithmetic (Round 2, RT2-H1 B3): when the diary's
    // people are known to the gate, an approval signed by an id that is
    // none of them is a ghost signature — the proposal is void here, the
    // same way a self-signed one is. An empty people list signs nothing.
    // BOTH signatures belong to the diary (Round 3, RT3-H1 B5): the
    // proposer's membership is checked here too, not only in
    // decideProposal — a wipe nobody in the diary proposed is void at
    // the gate, however genuine its second signature looks.
    if (people && p.state === "approved" && typeof p.decidedBy === "string" && (!people.some((person) => person.id === p.decidedBy) || !people.some((person) => person.id === p.proposedBy))) continue;
    // A pending proposal whose week has lapsed caduces silently (the law):
    // it is dropped here, at the gate, and never resurfaces.
    if (p.state !== "approved" && expiresAt < now) continue;
    // An approval is only as real as its second signature: an "approved"
    // proposal whose decider is missing, or is the proposer himself, is
    // void — the gate drops it like a lapsed one, so no ingress (sync,
    // backup restore, a tampered client) can smuggle a one-person
    // consent past the government of two.
    if (p.state === "approved" && (typeof p.decidedBy !== "string" || !p.decidedBy || p.decidedBy === p.proposedBy || finiteStamp(p.decidedAt) === undefined)) continue;
    out.push({
      id: p.id,
      kind: p.kind as Proposal["kind"],
      ...(typeof p.targetId === "string" && p.targetId ? { targetId: p.targetId } : {}),
      ...(typeof p.targetLabel === "string" && p.targetLabel ? { targetLabel: p.targetLabel.slice(0, 120) } : {}),
      proposedBy: p.proposedBy,
      proposedAt,
      state: p.state === "approved" ? "approved" : "pending",
      ...(typeof p.decidedBy === "string" && p.decidedBy ? { decidedBy: p.decidedBy } : {}),
      ...(finiteStamp(p.decidedAt) !== undefined ? { decidedAt: p.decidedAt } : {}),
      expiresAt,
    });
  }
  /* One id seats one proposal (Round 4, RT4-H6 B5): duplicate ids
   * passed every id-keyed gate and seated twice. The copy that knows
   * more wins — decided over proposed, then the greater stamp, then
   * content — as the merge union resolves them. */
  const byId = new Map<string, Proposal>();
  for (const p of out) {
    const prev = byId.get(p.id);
    if (!prev) { byId.set(p.id, p); continue; }
    const s = (p.decidedAt ?? p.proposedAt) - (prev.decidedAt ?? prev.proposedAt);
    if (s > 0) byId.set(p.id, p);
    else if (s === 0) {
      const rank = (x: Proposal) => (x.state === "approved" ? 1 : 0);
      if (rank(p) > rank(prev) || (rank(p) === rank(prev) && JSON.stringify(p) > JSON.stringify(prev))) byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}
