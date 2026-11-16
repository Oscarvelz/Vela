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

export async function verifyPin(person: Person | undefined, pin: string): Promise<boolean> {
  if (!person?.pin || !pin) return false;
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
    if (typeof p.id !== "string" || !p.id || seen.has(p.id)) continue;
    if (typeof p.name !== "string" || !p.name.trim()) continue;
    if (p.role !== "owner" && p.role !== "partner") continue;
    seen.add(p.id);
    out.push({
      id: p.id.slice(0, 40),
      name: p.name.trim().slice(0, 60),
      role: p.role,
      ...(p.speakAs && SPEAK_AS.includes(p.speakAs) ? { speakAs: p.speakAs } : {}),
      ...(p.pin &&
      typeof p.pin === "object" &&
      typeof p.pin.salt === "string" &&
      typeof p.pin.hash === "string" &&
      typeof p.pin.iterations === "number"
        ? { pin: { salt: p.pin.salt, hash: p.pin.hash, iterations: p.pin.iterations } }
        : {}),
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
    });
  }
  return out.slice(0, 2);
}

export function ownerPerson(people: Person[] | undefined): Person | undefined {
  return (people ?? []).find((p) => p.role === "owner");
}

export function partnerPerson(people: Person[] | undefined): Person | undefined {
  return (people ?? []).find((p) => p.role === "partner");
}

/** People merge by id (2.2): for the same person, the newer record wins. */
export function mergePeople(local: Person[] | undefined, remote: Person[] | undefined): Person[] | undefined {
  const a = local ?? [];
  const b = remote ?? [];
  if (!a.length && !b.length) return undefined;
  const byId = new Map<string, Person>();
  for (const p of [...a, ...b]) {
    const prev = byId.get(p.id);
    if (!prev || p.updatedAt >= prev.updatedAt) byId.set(p.id, p);
  }
  return [...byId.values()];
}

export function newPersonId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
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

export function cleanProposals(raw: unknown): Proposal[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out: Proposal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<Proposal>;
    if (typeof p.id !== "string" || !p.id) continue;
    if (!PROPOSAL_KINDS.includes(p.kind as (typeof PROPOSAL_KINDS)[number])) continue;
    if (typeof p.proposedBy !== "string" || typeof p.proposedAt !== "number" || typeof p.expiresAt !== "number") continue;
    // A pending proposal whose week has lapsed caduces silently (the law):
    // it is dropped here, at the gate, and never resurfaces.
    if (p.state !== "approved" && p.expiresAt < now) continue;
    // An approval is only as real as its second signature: an "approved"
    // proposal whose decider is missing, or is the proposer himself, is
    // void — the gate drops it like a lapsed one, so no ingress (sync,
    // backup restore, a tampered client) can smuggle a one-person
    // consent past the government of two.
    if (p.state === "approved" && (typeof p.decidedBy !== "string" || !p.decidedBy || p.decidedBy === p.proposedBy || typeof p.decidedAt !== "number")) continue;
    out.push({
      id: p.id,
      kind: p.kind as Proposal["kind"],
      ...(typeof p.targetId === "string" && p.targetId ? { targetId: p.targetId } : {}),
      ...(typeof p.targetLabel === "string" && p.targetLabel ? { targetLabel: p.targetLabel.slice(0, 120) } : {}),
      proposedBy: p.proposedBy,
      proposedAt: p.proposedAt,
      state: p.state === "approved" ? "approved" : "pending",
      ...(typeof p.decidedBy === "string" && p.decidedBy ? { decidedBy: p.decidedBy } : {}),
      ...(typeof p.decidedAt === "number" ? { decidedAt: p.decidedAt } : {}),
      expiresAt: p.expiresAt,
    });
  }
  return out;
}
