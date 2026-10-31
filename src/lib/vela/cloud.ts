/* Supabase client + the one encrypted row per user (public.vela_vault).
   The row only ever holds ciphertext, iv, salt and KDF params. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config";
import { asEnvelope, type Envelope } from "./vault-crypto";

export const TABLE = "vela_vault";
export const AUTH_STORAGE_KEY = "vela-auth";

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;

/** Lazily loads supabase-js so the offline-only build never needs it. */
export function getClient(): Promise<SupabaseClient | null> {
  if (!cloudConfigured) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  if (!loading) {
    loading = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
        });
        return client;
      })
      .catch(() => {
        loading = null;
        return null;
      });
  }
  return loading;
}

export type CloudUser = { id: string; email: string };

export function userFromSession(s: Session | null): CloudUser | null {
  return s?.user ? { id: s.user.id, email: s.user.email ?? "" } : null;
}

export type RemoteVault = { envelope: Envelope; revision: number; updatedAt: string } | null;

export async function pullVault(userId: string): Promise<RemoteVault> {
  const sb = await getClient();
  if (!sb) throw new Error("offline");
  const { data, error } = await sb
    .from(TABLE)
    .select("ciphertext, iv, salt, kdf, version, revision, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const envelope = asEnvelope({ v: data.version, kdf: data.kdf, salt: data.salt, iv: data.iv, ciphertext: data.ciphertext });
  if (!envelope) throw new Error("bad-row");
  return { envelope, revision: Number(data.revision) || 0, updatedAt: String(data.updated_at ?? "") };
}

export type PushResult = { ok: true; revision: number } | { ok: false; conflict: true };

/** Optimistic concurrency: only writes when the row is still at baseRevision. */
export async function pushVault(userId: string, env: Envelope, baseRevision: number): Promise<PushResult> {
  const sb = await getClient();
  if (!sb) throw new Error("offline");
  const row = { ciphertext: env.ciphertext, iv: env.iv, salt: env.salt, kdf: env.kdf, version: env.v };
  if (baseRevision === 0) {
    const { data, error } = await sb.from(TABLE).insert({ ...row, user_id: userId, revision: 1 }).select("revision").maybeSingle();
    if (error) {
      if (error.code === "23505") return { ok: false, conflict: true };
      throw error;
    }
    return { ok: true, revision: Number(data?.revision) || 1 };
  }
  const { data, error } = await sb
    .from(TABLE)
    .update({ ...row, revision: baseRevision + 1 })
    .eq("user_id", userId)
    .eq("revision", baseRevision)
    .select("revision");
  if (error) throw error;
  if (!data || data.length === 0) return { ok: false, conflict: true };
  return { ok: true, revision: Number(data[0].revision) || baseRevision + 1 };
}
