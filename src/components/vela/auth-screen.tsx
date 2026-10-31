import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import { askFingerprintOnOpen, bioFailCode, bioSupported, enrollFingerprint } from "@/lib/vela/fingerprint";
import { MIN_PASSPHRASE } from "@/lib/vela/vault-crypto";
import { openFromCloud, resetSyncMeta, useCloud } from "@/lib/vela/sync";
import type { CopyKey } from "@/lib/vela/copy";
import { cn } from "@/lib/cn";
import { Mark } from "./mark";
import { AccountPanel } from "./account-panel";
import { Button, ConfirmDialog, fieldClass } from "./ui";

export function AuthScreen() {
  const t = useT();
  const vault = useJournal((s) => s.vault);
  const vaultId = useJournal((s) => s.vaultId);
  const language = useJournal((s) => s.journal.settings.language);
  const setLanguage = useJournal((s) => s.setLanguage);
  const remote = useCloud((s) => s.remote);
  const user = useCloud((s) => s.user);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(false);

  const failText = (code: string) => {
    const key = (
      code === "mismatch"
        ? "bioMismatch"
        : code === "insecure"
          ? "bioInsecure"
          : code === "unsupported"
            ? "bioUnsupported"
            : code === "already"
              ? "bioAlready"
              : code === "missing"
                ? "bioMissing"
                : "bioFailed"
    ) satisfies CopyKey;
    return t(key);
  };

  useEffect(() => {
    if (vault !== "locked" || !vaultId) return;
    askFingerprintOnOpen(
      vaultId,
      (passphrase) => useJournal.getState().unlock(passphrase),
      (code) => setError(failText(code)),
    );
    // Ask once per visit to the lock screen. Lock resets that flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault, vaultId]);

  const cloudCopy = vault === "none" && user && remote && !fresh;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="text-center">
        <Mark className="mx-auto size-16" />
        <h1 className="mt-4 font-display text-4xl tracking-brand">VELA</h1>
        <p className="mt-2 text-xs tracking-widest text-dim uppercase">{t("tagline")}</p>
      </div>
      <div className="mt-6 flex justify-center" role="group" aria-label={t("langLabel")}>
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
      <div className="ag-panel mt-4 rounded-card border border-border px-5 py-5">
        {vault === "locked" ? (
          <UnlockForm error={error} setError={setError} />
        ) : cloudCopy ? (
          <CloudOpenForm onFresh={() => setFresh(true)} />
        ) : (
          <CreateForm failText={failText} />
        )}
      </div>
      <div className="ag-panel mt-4 rounded-card border border-border px-5 py-5">
        <AccountPanel />
      </div>
      <p className="mt-6 text-center text-xs leading-relaxed text-dim">{t("privateByDesign")}</p>
    </div>
  );
}

function UnlockForm({ error, setError }: { error: string; setError: (v: string) => void }) {
  const t = useT();
  const unlock = useJournal((s) => s.unlock);
  const forgetDevice = useJournal((s) => s.forgetDevice);
  const [pass, setPass] = useState("");
  const [pending, setPending] = useState(false);
  const [askForget, setAskForget] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        void unlock(pass).then((ok) => {
          setPending(false);
          if (!ok) setError(t("incorrectPin"));
          else setPass("");
        });
      }}
    >
      <h2 className="text-center font-display text-3xl">{t("lockedTitle")}</h2>
      <p className="text-center text-sm leading-relaxed text-dim">{t("lockedBody")}</p>
      <label className="block text-sm font-semibold" htmlFor="unlock-pass">
        {t("pinFor")}
      </label>
      <input
        id="unlock-pass"
        className={fieldClass}
        type="password"
        autoComplete="current-password"
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
        {pending ? t("unlocking") : t("unlock")}
      </Button>
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
      <input
        className={fieldClass}
        type="password"
        autoComplete="current-password"
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

function CreateForm({ failText }: { failText: (code: string) => string }) {
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
        void createJournal(name, pass, Boolean(legacy) && useLegacy).then(async (result) => {
          setPending(false);
          if (result === "short") {
            setError(t("pinPh"));
            return;
          }
          resetSyncMeta();
          const vaultId = useJournal.getState().vaultId;
          if (bioSupported() && vaultId) {
            try {
              await enrollFingerprint(pass, vaultId);
            } catch (err) {
              if (bioFailCode(err) !== "cancel") useJournal.getState().showToast(failText(bioFailCode(err)));
            }
          }
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
      <input
        id="create-pass"
        className={fieldClass}
        type="password"
        autoComplete="new-password"
        placeholder={t("pinPh")}
        value={pass}
        onChange={(event) => setPass(event.target.value)}
      />
      <input
        id="create-pass2"
        className={fieldClass}
        type="password"
        autoComplete="new-password"
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
