/* ───────────────────────────────────────────────────────────────────────────
   Vela cloud settings — the ONLY file to edit to turn on sync.

   1. Supabase dashboard → Project Settings → API (or "Connect").
   2. Paste the Project URL and the anon / publishable key below.
   3. Rebuild (npm run build) and commit the docs/ folder.

   Both values are public by design: every row is protected by row-level
   security, and the journal itself is end-to-end encrypted before upload.
   While these stay as placeholders, Vela runs fully offline on the device.
   ─────────────────────────────────────────────────────────────────────────── */

export const SUPABASE_URL = "SUPABASE_URL";
export const SUPABASE_ANON_KEY = "SUPABASE_ANON_KEY";

export const cloudConfigured =
  /^https:\/\/[^\s"]+$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_ANON_KEY.includes("SUPABASE_");
