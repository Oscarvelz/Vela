# Vela

A private intimacy journal that runs entirely in your browser and works offline.
Live site: **https://oscarvelz.github.io/Vela/**

## How your privacy works

- You choose a **passphrase** the first time you open Vela. Your whole journal is
  encrypted with it (PBKDF2-SHA256, 600,000 rounds → AES-GCM 256) before it is saved anywhere.
- On your phone or computer, the journal is stored **encrypted** in the browser (IndexedDB).
  The readable version only exists in memory while the diary is open. Locking it (by hand or by
  auto-lock) wipes it from memory.
- If you sign in, only the **encrypted** journal is uploaded to your account. The server
  stores ciphertext and cannot read it.
- The passphrase is for encryption only: you enter it **once per device**. The key it derives
  stays on that device (a non-extractable key in IndexedDB), so it is asked again only on a new
  device, after removing the journal from this one, or to recover or change it.
- Opening Vela is guarded by the **app lock**, like the Journey diary: the phone's fingerprint /
  screen lock, asked on every fresh launch and when you come back after leaving for more than
  10 seconds (Settings → Privacy & Security: immediately / 10 s / 1 min / 5 min, or off).
- **If you forget the passphrase, the journal cannot be recovered.** There is no reset —
  not by you, not by anyone. Write it down somewhere safe.

## Publishing on GitHub Pages (no build needed)

The finished site is already in the `docs/` folder.

1. Create a repository named **Vela** under the account **Oscarvelz** and upload these files.
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch **main**, folder **/docs**. Save.
3. After a minute the app is live at https://oscarvelz.github.io/Vela/.

Until cloud sync is set up, the app works fully on the device and shows a small
"Cloud sync not set up yet" note.

## Turning on cloud sync (Supabase)

1. In your Supabase project, open **SQL Editor**, paste the contents of
   `supabase/vela.sql`, and run it. It only creates things named `vela_…`,
   so it is safe in a project shared with other apps (like FARO).
2. **Authentication → URL Configuration**
   - Site URL: `https://oscarvelz.github.io/Vela/`
     (if the project is shared and the Site URL is already used by another app, leave it and
     just add the redirect URLs below)
   - Redirect URLs: add `https://oscarvelz.github.io/Vela/` and
     `https://oscarvelz.github.io/Vela/**`
3. **Authentication → Providers → Email**: keep Email enabled. "Confirm email" can stay on;
   new accounts then confirm from their inbox before signing in.
4. Copy **Project URL** and the **anon / publishable key** (Project Settings → API) into
   `src/lib/vela/supabase-config.ts`, replacing `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
   These two values are meant to be public; every row is protected by row-level security.
5. Rebuild and commit the `docs/` folder:
   ```
   npm install
   npm run build
   ```

## Using it on a second device

Sign in with the same account. Vela finds your encrypted journal and asks for your
passphrase to open it. Edits made offline are saved on the device and sync when you are back
online. If two devices edit at the same time, the entries are merged.

## Backups

Settings → Data & Backup → **Export encrypted backup** saves a file that only your passphrase
can open. **Import backup** merges it back in (if it was made with an older passphrase, you are
asked for that one). CSV export is a readable spreadsheet — keep that file somewhere private.

## Coming from the earlier version

If this device still has the old journal (saved without encryption), Vela offers to import
it into the new encrypted journal and then deletes the unencrypted copy.

## Development

```
npm install
npm run dev      # local preview
npm run build    # type-check, build into docs/, refresh the offline cache list
```
