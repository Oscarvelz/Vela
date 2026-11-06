# Vela for Android

A thin WebView app around https://oscarvelz.github.io/Vela/ (package `com.oscarvelz.vela`, min Android 11).
Web releases arrive on their own (the page is loaded live; the service worker keeps it working offline).

- Bridge: `window.VelaNative` (see `src/lib/vela/native.ts`, feature-detected; the browser/PWA never see it):
  app lock through the phone's BiometricPrompt (fingerprint/face or the phone's PIN — WebAuthn is not available in a
  WebView), Back (`VelaBack` → the layered back stack; `exitApp` at Home or on the lock screen), bar colours,
  downloads into Downloads/Vela, leave/return signals for the lock timer, update offer from GitHub releases
  `android-N` (asset `Vela.apk`).
- Privacy: `allowBackup=false` + data-extraction rules (nothing goes to Android/Google backups), a blank Recents card
  (`setRecentsScreenshotEnabled(false)` on Android 13+, `FLAG_SECURE` below 13), always a fresh page on launch (the
  app lock asks), breadcrumbs hold app events only.
- Sign-in link: inside the app "Email me a sign-in link" returns to `vela://auth` (in the Supabase redirect allow
  list), which opens the app with the session.
- Build: `.github/workflows/android.yml` on `main` (only when `android/` changes). versionCode = `android/version.txt`.
- Signing: the key is private and never committed. With repo secrets `VELA_KS_B64` + `VELA_KS_PASS` CI signs and
  publishes; without them CI uploads `vela-unsigned-N`, the APK is signed privately (apksigner, alias `vela`) and pushed
  to the orphan branch `android-signed` (`Vela.apk`, `VERSION`=N, `NOTES.md`), whose workflow publishes release
  `android-N`. All updates must use the same key (certificate SHA-256 6a:fe:c9:39:…:df:6a:54).
- Download: https://github.com/Oscarvelz/Vela/releases/latest/download/Vela.apk
- Storage is separate from Chrome: sign in once and type the passphrase once on the phone.
