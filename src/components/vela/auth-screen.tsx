import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, ShieldAlert } from "lucide-react";
import { useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import { bioFailCode, bioForUser, bioSupported, fingerprintUnlock, platformAvailable } from "@/lib/vela/fingerprint";
import { appLockOn, enrollAppLock, gateReady, lockRecord, verifyAppLock } from "@/lib/vela/app-lock";
import { useBioT } from "@/lib/vela/bio-copy";
import { useBioUi } from "@/lib/vela/bio-offer";
import { BioButton, bioErrorKey } from "./bio";
import { MIN_PASSPHRASE } from "@/lib/vela/vault-crypto";
import { openFromCloud, resetSyncMeta, useCloud } from "@/lib/vela/sync";
import { cn } from "@/lib/cn";
import { FlameHalo, Mark } from "./mark";
import { AccountPanel } from "./account-panel";
import { Button, ConfirmDialog, fieldClass, filledByBrowser, PassphraseInput } from "./ui";

export function AuthScreen() {
  const t = useT();
  const vault = useJournal((s) => s.vault);
  const keyParked = useJournal((s) => s.keyParked);
  const language = useJournal((s) => s.journal.settings.language);
  const setLanguage = useJournal((s) => s.setLanguage);
  const remote = useCloud((s) => s.remote);
  const user = useCloud((s) => s.user);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(false);

  const cloudCopy = vault === "none" && user && remote && !fresh;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="text-center">
        <div className="vela-flame-stage mx-auto size-24">
          <FlameHalo />
          <Mark alive className="relative size-24" />
        </div>
        <h1 className="vela-rise vela-wordmark mt-5 font-display text-4xl tracking-brand" style={{ animationDelay: "120ms" }}>
          VELA
        </h1>
        <p className="vela-rise mt-2 text-xs tracking-widest text-dim uppercase" style={{ animationDelay: "220ms" }}>
          {t("tagline")}
        </p>
      </div>
      <div className="vela-rise mt-6 flex justify-center" style={{ animationDelay: "300ms" }} role="group" aria-label={t("langLabel")}>
        {(["en", "es"] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            className={cn("min-h-10 px-4 text-sm font-semibold", language === lang ? "text-accent" : "text-dim")}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="vela-rise ag-panel mt-4 rounded-card border border-border px-5 py-5" style={{ animationDelay: "380ms" }}>
        {vault === "locked" ? (
          <UnlockForm error={error} setError={setError} />
        ) : cloudCopy ? (
          <CloudOpenForm onFresh={() => setFresh(true)} />
        ) : (
          <CreateForm />
        )}
      </div>
      {vault === "locked" && keyParked ? null : (
        <div className="vela-rise ag-panel mt-4 rounded-card border border-border px-5 py-5" style={{ animationDelay: "470ms" }}>
          <AccountPanel />
        </div>
      )}
      <p className="mt-6 text-center text-xs leading-relaxed text-dim">{t("privateByDesign")}</p>
    </div>
  );
}

/** Wait until the page is visible and focused (WebAuthn refuses an unfocused page). */
function whenFocused(run: () => void) {
  if (document.visibilityState === "visible" && document.hasFocus()) {
    const id = window.setTimeout(run, 180);
    return () => window.clearTimeout(id);
  }
  let done = false;
  const go = () => {
    if (done || document.visibilityState !== "visible") return;
    done = true;
    cleanup();
    window.setTimeout(run, 180);
  };
  const cleanup = () => {
    window.removeEventListener("focus", go);
    document.removeEventListener("visibilitychange", go);
  };
  window.addEventListener("focus", go);
  document.addEventListener("visibilitychange", go);
  return () => {
    done = true;
    cleanup();
  };
}

type UnlockMode = "gate" | "recover" | "pass";

/**
 * The lock screen. With the journal key parked on this device (the usual case) it only asks for the app lock:
 * fingerprint / screen lock, like Journey. The passphrase is asked only when this device has no usable key
 * (new device, removed journal, key no longer valid), and as the last resort when the fingerprint keeps failing.
 */
function UnlockForm({ error, setError }: { error: string; setError: (v: string) => void }) {
  const t = useT();
  const bt = useBioT();
  const vaultId = useJournal((s) => s.vaultId);
  const keyParked = useJournal((s) => s.keyParked);
  const tick = useBioUi((s) => s.tick);
  void tick;
  const gate = keyParked && gateReady();
  // No key on this device, but the fingerprint sealed the passphrase earlier: it can still open the journal.
  const recover = !keyParked && bioSupported() && Boolean(vaultId && bioForUser(vaultId));
  const [mode, setMode] = useState<UnlockMode>(gate ? "gate" : recover ? "recover" : "pass");
  const [asking, setAsking] = useState(false);
  const [tried, setTried] = useState(false);
  const [fallen, setFallen] = useState(false);
  const [keyNote, setKeyNote] = useState(!keyParked && Boolean(lockRecord()) && !recover);
  const [platform, setPlatform] = useState(false);
  useEffect(() => {
    void platformAvailable().then(setPlatform);
  }, []);
  const busy = useRef(false);
  /** Real failures/cancels in a row (an instant refusal because the page wasn't focused doesn't count). */
  const misses = useRef(0);

  // App lock turned off on this device: nothing to ask, the parked key opens it.
  useEffect(() => {
    if (keyParked && !appLockOn()) void useJournal.getState().openParked();
  }, [keyParked]);

  const afterOpen = useCallback(
    async (res: "ok" | "missing" | "invalid") => {
      if (res === "ok") return;
      useBioUi.getState().bump();
      if (res === "missing" && vaultId && bioForUser(vaultId) && bioSupported()) {
        setMode("recover");
        return;
      }
      setKeyNote(res === "missing");
      if (res === "invalid") setError(t("bioMismatch"));
      setMode("pass");
    },
    [vaultId, setError, t],
  );

  const ask = useCallback(
    (retryOnBlur = true) => {
      if (busy.current || !vaultId) return;
      busy.current = true;
      setAsking(true);
      setError("");
      const started = Date.now();
      const attempt: Promise<{ ok: true } | { ok: false; code: string }> =
        mode === "recover"
          ? fingerprintUnlock(vaultId, (p) => useJournal.getState().unlock(p))
          : verifyAppLock().then(async (res) => {
              if (!res.ok) return res;
              const opened = await useJournal.getState().openParked();
              if (opened !== "ok") void afterOpen(opened);
              return { ok: true as const };
            });
      void attempt.then((res) => {
        busy.current = false;
        setAsking(false);
        setTried(true);
        if (res.ok) {
          misses.current = 0;
          return;
        }
        if (res.code === "busy") return;
        const instant = Date.now() - started < 600;
        if (res.code === "cancel" && instant && !document.hasFocus()) {
          // Chrome rejects at once when the page isn't focused yet (app just opened): ask again on focus.
          if (retryOnBlur) whenFocused(() => ask(false));
          return;
        }
        if (mode === "recover" && (res.code === "mismatch" || res.code === "missing" || res.code === "unsupported" || res.code === "insecure")) {
          // The sealed passphrase can't open the journal now: the passphrase takes over.
          useBioUi.getState().bump();
          setMode("pass");
          setError(t(bioErrorKey(res.code)));
          return;
        }
        const gone = res.code === "missing" || res.code === "unsupported" || res.code === "insecure" || res.code === "none";
        misses.current += 1;
        if (gone || misses.current >= 3) {
          // The fingerprint keeps failing or the credential is gone: offer to set it up again first.
          setFallen(true);
          return;
        }
        if (res.code !== "cancel") setError(t(bioErrorKey(res.code)));
      });
    },
    [vaultId, mode, setError, t, afterOpen],
  );

  // Open → the prompt starts by itself. Coming back to the app on the lock screen asks again.
  useEffect(() => {
    if (mode === "pass" || fallen) return;
    const stop = whenFocused(() => ask());
    const onVisible = () => {
      if (document.visibilityState === "visible") whenFocused(() => ask());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fallen]);

  const [enrolling, setEnrolling] = useState(false);
  const reenrol = () => {
    if (enrolling) return;
    setEnrolling(true);
    setError("");
    enrollAppLock(vaultId, "")
      .then(async () => {
        misses.current = 0;
        setFallen(false);
        useBioUi.getState().bump();
        const opened = await useJournal.getState().openParked();
        if (opened !== "ok") void afterOpen(opened);
      })
      .catch((err) => {
        const code = bioFailCode(err);
        if (code !== "cancel") setError(t(bioErrorKey(code)));
      })
      .finally(() => setEnrolling(false));
  };

  if (mode !== "pass") {
    return (
      <div className="space-y-3 text-center" data-testid="bio-lock" data-mode={mode}>
        <h2 className="font-display text-3xl">{bt("touchTitle")}</h2>
        <p className="text-sm leading-relaxed text-dim">{bt("touchBody")}</p>
        <div className="py-3">
          <BioButton
            asking={asking}
            label={bt("touchBtn")}
            onClick={() => {
              misses.current = fallen ? 0 : misses.current;
              setFallen(false);
              ask(false);
            }}
          />
        </div>
        <p className="min-h-5 text-sm text-accent" aria-live="polite">
          {asking ? bt("touchAsking") : tried && !error && !fallen ? bt("touchRetry") : ""}
        </p>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {fallen ? (
          <div className="vela-gate-fall space-y-2 text-left" data-testid="gate-fall" role="status">
            <p className="font-semibold">{bt("gateFallTitle")}</p>
            <p className="text-sm leading-relaxed text-dim">{bt("gateFallBody")}</p>
            <div className="grid gap-2 pt-1">
              {mode === "gate" ? (
                <Button className="w-full" disabled={enrolling} onClick={reenrol} data-testid="gate-reenrol">
                  <Fingerprint className="size-4" /> {bt("gateReenrol")}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="w-full"
                data-testid="gate-retry"
                onClick={() => {
                  misses.current = 0;
                  setFallen(false);
                  setError("");
                  window.setTimeout(() => ask(false), 0);
                }}
              >
                {bt("gateRetry")}
              </Button>
            </div>
          </div>
        ) : null}
        {fallen || mode === "recover" ? (
          <button
            type="button"
            className="mx-auto block min-h-11 px-3 text-sm font-semibold text-dim underline underline-offset-4"
            data-testid="use-pass"
            onClick={() => {
              setError("");
              setMode("pass");
            }}
          >
            {mode === "gate" ? bt("gatePassLast") : bt("usePass")}
          </button>
        ) : null}
      </div>
    );
  }
  const canGate = keyParked && gateReady();
  // The key is on this device but no fingerprint is set up (or it was removed): set it up here instead.
  const canSetup = keyParked && platform && appLockOn() && bioSupported() && !lockRecord();
  const canRecover = !keyParked && bioSupported() && Boolean(vaultId && bioForUser(vaultId));
  return (
    <PassUnlock
      error={error}
      note={keyNote ? bt("gateKeyLost") : ""}
      setError={setError}
      onSetup={canSetup ? reenrol : undefined}
      setupBusy={enrolling}
      onFinger={
        canGate || canRecover
          ? () => {
              setError("");
              setFallen(false);
              misses.current = 0;
              setMode(canGate ? "gate" : "recover");
            }
          : undefined
      }
    />
  );
}

function PassUnlock({
  error,
  note,
  setError,
  onFinger,
  onSetup,
  setupBusy,
}: {
  error: string;
  note?: string;
  setError: (v: string) => void;
  onFinger?: () => void;
  onSetup?: () => void;
  setupBusy?: boolean;
}) {
  const t = useT();
  const bt = useBioT();
  const unlock = useJournal((s) => s.unlock);
  const forgetDevice = useJournal((s) => s.forgetDevice);
  const lockNote = useJournal((s) => s.lockNote);
  const [pass, setPass] = useState("");
  const [pending, setPending] = useState(false);
  const [askForget, setAskForget] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  return (
    <form
      className="space-y-3"
      autoComplete="off"
      data-testid="pass-unlock"
      onSubmit={(event) => {
        event.preventDefault();
        // One attempt at a time (Enter + tap, double tap), and always what the field shows now:
        // an autofill or keyboard commit can change the field without React seeing it yet.
        if (inFlight.current) return;
        const el = field.current;
        const value = el ? el.value : pass;
        if (!value) return;
        const autofilled = filledByBrowser(el);
        inFlight.current = true;
        setPending(true);
        setError("");
        void unlock(value)
          .then((ok) => {
            if (ok) {
              setPass("");
              return;
            }
            if (autofilled) {
              // Don't leave the account (or another app's) password in place for the next try.
              setPass("");
              if (el) {
                el.value = "";
                el.dataset.autofilled = "0";
                el.focus();
              }
              setError(t("passAutofilled"));
            } else setError(t("incorrectPin"));
          })
          .finally(() => {
            inFlight.current = false;
            setPending(false);
          });
      }}
    >
      <h2 className="text-center font-display text-3xl">{t("lockedTitle")}</h2>
      <p className="text-center text-sm leading-relaxed text-dim">{lockNote === "stale" ? t("lockedStale") : note || t("lockedBody")}</p>
      <label className="block text-sm font-semibold" htmlFor="unlock-pass">
        {t("pinFor")}
      </label>
      <PassphraseInput
        id="unlock-pass"
        ref={field}
        className={fieldClass}
        placeholder={t("enterPin")}
        value={pass}
        onChange={(event) => setPass(event.target.value)}
      />
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("unlocking") : t("unlock")}
      </Button>
      {onSetup ? (
        <Button variant="ghost" className="w-full" onClick={onSetup} disabled={setupBusy} data-testid="pass-setup-finger">
          <Fingerprint className="size-4 text-accent" /> {bt("lockSetup")}
        </Button>
      ) : null}
      {onFinger ? (
        <Button variant="ghost" className="w-full" onClick={onFinger} data-testid="use-finger">
          <Fingerprint className="size-4 text-accent" /> {bt("useFinger")}
        </Button>
      ) : null}
      <button type="button" className="mx-auto block min-h-10 text-xs text-dim underline" onClick={() => setAskForget(true)}>
        {t("forgotPass")}
      </button>
      <ConfirmDialog
        open={askForget}
        title={t("forgetDeviceQ")}
        confirmLabel={t("forgetDeviceBtn")}
        cancelLabel={t("keep")}
        onCancel={() => setAskForget(false)}
        onConfirm={() => {
          setAskForget(false);
          void forgetDevice().then(() => resetSyncMeta());
        }}
      />
    </form>
  );
}

function CloudOpenForm({ onFresh }: { onFresh: () => void }) {
  const t = useT();
  const [pass, setPass] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        void openFromCloud(pass).then((ok) => {
          setPending(false);
          if (!ok) setError(t("incorrectPin"));
        });
      }}
    >
      <h2 className="text-center font-display text-2xl">{t("cloudFoundTitle")}</h2>
      <p className="text-center text-sm leading-relaxed text-dim">{t("cloudFoundBody")}</p>
      <PassphraseInput
        id="cloud-pass"
        className={fieldClass}
        placeholder={t("enterPin")}
        value={pass}
        onChange={(event) => setPass(event.target.value)}
      />
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending || !pass}>
        {pending ? t("unlocking") : t("openCloud")}
      </Button>
      <button type="button" className="mx-auto block min-h-10 text-xs text-dim underline" onClick={onFresh}>
        {t("createJournal")}
      </button>
    </form>
  );
}

function CreateForm() {
  const t = useT();
  const createJournal = useJournal((s) => s.createJournal);
  const legacy = useJournal((s) => s.legacy);
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [ack, setAck] = useState(false);
  const [useLegacy, setUseLegacy] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-3"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        if (pass.length < MIN_PASSPHRASE) return setError(t("pinPh"));
        if (pass !== pass2) return setError(t("passMismatch"));
        if (!ack) return setError(t("passWarnNeed"));
        setPending(true);
        void createJournal(name, pass, Boolean(legacy) && useLegacy).then((result) => {
          setPending(false);
          if (result === "short") {
            setError(t("pinPh"));
            return;
          }
          resetSyncMeta();
          // Fingerprint is offered by a one-tap sheet once the journal opens.
        });
      }}
    >
      <p className="text-sm leading-relaxed text-dim">{t("authIntro")}</p>
      {legacy ? (
        <div className="rounded-control border border-accent/50 bg-accent-soft px-3 py-3 text-sm" data-testid="legacy-setup">
          <p className="font-semibold">{t("legacyTitle")}</p>
          <p className="mt-1 text-dim">
            {t("legacyBody")} {legacy.sessions.length}
          </p>
          <label className="mt-2 flex items-start gap-2">
            <input type="checkbox" className="mt-1 size-4 accent-[var(--ag-accent)]" checked={useLegacy} onChange={(e) => setUseLegacy(e.target.checked)} />
            <span>{t("legacySetup")}</span>
          </label>
        </div>
      ) : null}
      <label className="block text-sm font-semibold" htmlFor="name">
        {t("displayName")}
      </label>
      <input
        id="name"
        className={fieldClass}
        autoComplete="off"
        placeholder={t("displayNamePh")}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className="block text-sm font-semibold" htmlFor="create-pass">
        {t("pinPassword")}
      </label>
      <PassphraseInput
        id="create-pass"
        className={fieldClass}
        placeholder={t("pinPh")}
        value={pass}
        onChange={(event) => setPass(event.target.value)}
      />
      <PassphraseInput
        id="create-pass2"
        className={fieldClass}
        placeholder={t("confirmPassphrase")}
        aria-label={t("confirmPassphrase")}
        value={pass2}
        onChange={(event) => setPass2(event.target.value)}
      />
      <p className="text-xs leading-relaxed text-dim">{t("pinNote")}</p>
      <div className="rounded-control border border-danger/60 px-3 py-3 text-sm" role="note" data-testid="pass-warning">
        <p className="flex items-center gap-2 font-semibold text-danger">
          <ShieldAlert className="size-4" /> {t("passWarnTitle")}
        </p>
        <p className="mt-1 leading-relaxed">{t("passWarn")}</p>
        <label className="mt-2 flex items-start gap-2">
          <input id="pass-ack" type="checkbox" className="mt-1 size-4 accent-[var(--ag-accent)]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>{t("passWarnAck")}</span>
        </label>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("pleaseWait") : t("createJournal")}
      </Button>
    </form>
  );
}
