import { useEffect, useState } from "react";
import { CloudOff, KeyRound, RefreshCw } from "lucide-react";
import { getClient, keepSignedIn, setKeepSignedIn } from "@/lib/vela/cloud";
import { cloudConfigured } from "@/lib/vela/supabase-config";
import { useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import { adoptRemotePassphrase, signOut, syncNow, useCloud } from "@/lib/vela/sync";
import { Button, fieldClass, PassphraseInput, PasswordInput } from "./ui";

function appUrl() {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}

export function AccountPanel() {
  const t = useT();
  const authReady = useCloud((s) => s.authReady);
  const user = useCloud((s) => s.user);
  const sessionGone = useCloud((s) => s.sessionGone);
  const lastEmail = useCloud((s) => s.lastEmail);
  const cloudPhase = useJournal((s) => s.cloudPhase);
  const unlocked = useJournal((s) => s.unlocked);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(() => (useCloud.getState().sessionGone ? useCloud.getState().lastEmail : ""));
  const [keep, setKeep] = useState(keepSignedIn);
  useEffect(() => {
    if (sessionGone && lastEmail) setEmail((cur) => cur || lastEmail);
  }, [sessionGone, lastEmail]);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [pass, setPass] = useState("");

  if (!cloudConfigured) {
    return (
      <p className="flex items-start gap-2 text-sm leading-relaxed text-dim" data-testid="cloud-off">
        <CloudOff className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>{t("cloudOff")}</span>
      </p>
    );
  }
  if (!authReady) return <p className="text-sm text-dim">{t("opening")}</p>;

  if (user) {
    const status =
      cloudPhase === "saving"
        ? t("syncing")
        : cloudPhase === "offline"
          ? t("cloudOffline")
          : cloudPhase === "error"
            ? t("syncError")
            : cloudPhase === "other-account"
              ? t("cloudOther")
              : cloudPhase === "needs-pass"
                ? t("cloudNeedsPass")
                : cloudPhase === "saved"
                  ? t("synced")
                  : "";
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-dim">{t("cloudBody")}</p>
        <p className="text-sm">
          {t("signedInAs")} <b>{user.email}</b>
        </p>
        {unlocked && status ? <p className="text-sm font-semibold" data-testid="cloud-status">{status}</p> : null}
        {unlocked && cloudPhase === "needs-pass" ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              setPending(true);
              void adoptRemotePassphrase(pass).then((ok) => {
                setPending(false);
                if (ok) setPass("");
                else setError(t("incorrectPin"));
              });
            }}
          >
            <PassphraseInput
              id="cloud-merge-pass"
              className={fieldClass}
              placeholder={t("cloudPassPh")}
              value={pass}
              onChange={(event) => setPass(event.target.value)}
            />
            <Button type="submit" className="w-full" disabled={pending || !pass}>
              {pending ? t("unlocking") : t("cloudPassBtn")}
            </Button>
          </form>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {unlocked ? (
            <Button variant="ghost" onClick={() => void syncNow()}>
              <RefreshCw className="size-4" /> {t("syncNow")}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" onClick={() => void signOut()}>
            {t("signOut")}
          </Button>
        </div>
      </div>
    );
  }

  async function submit() {
    setError("");
    setNote("");
    if (!email.includes("@") || password.length < 8) {
      setError(t("passwordHint"));
      return;
    }
    if (mode === "up" && password !== password2) {
      setError(t("passwordMismatch"));
      return;
    }
    setPending(true);
    setKeepSignedIn(keep);
    try {
      const sb = await getClient();
      if (!sb) throw new Error("offline");
      if (mode === "up") {
        const { data, error: err } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: appUrl() },
        });
        if (err) setError(err.message || t("authFailed"));
        else if (!data.session) setNote(t("checkEmail"));
      } else {
        const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(t("authFailed"));
      }
    } catch {
      setError(t("syncError"));
    } finally {
      setPending(false);
    }
  }

  async function magic() {
    setError("");
    setNote("");
    if (!email.includes("@")) {
      setError(t("email"));
      return;
    }
    setPending(true);
    setKeepSignedIn(keep);
    try {
      const sb = await getClient();
      if (!sb) throw new Error("offline");
      const { error: err } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: appUrl() } });
      if (err) setError(err.message || t("authFailed"));
      else setNote(t("magicSent"));
    } catch {
      setError(t("syncError"));
    } finally {
      setPending(false);
    }
  }

  const again = sessionGone && mode === "in";

  return (
    <div className="space-y-3">
      {sessionGone ? (
        <div className="vela-relogin" data-testid="relogin" role="status">
          <span className="vela-relogin-icon" aria-hidden="true">
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{t("sessionEndedTitle")}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-dim">{t("sessionEndedBody")}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-dim">{t("cloudBody")}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant={mode === "in" ? "primary" : "ghost"} onClick={() => setMode("in")}>
          {t("signIn")}
        </Button>
        <Button variant={mode === "up" ? "primary" : "ghost"} onClick={() => setMode("up")}>
          {t("createAccount")}
        </Button>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm font-semibold" htmlFor="account-email">
          {t("email")}
        </label>
        <input
          id="account-email"
          className={fieldClass}
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label className="block text-sm font-semibold" htmlFor="account-password">
          {t("password")}
        </label>
        <PasswordInput
          id="account-password"
          name="password"
          className={fieldClass}
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mode === "up" ? (
          <>
            <label className="block text-sm font-semibold" htmlFor="account-password2">
              {t("confirmPassword")}
            </label>
            <PasswordInput
              id="account-password2"
              className={fieldClass}
              autoComplete="new-password"
              value={password2}
              onChange={(event) => setPassword2(event.target.value)}
            />
          </>
        ) : null}
        <p className="text-xs leading-relaxed text-dim">{t("passwordHint")}</p>
        <label className="vela-keep" htmlFor="account-keep">
          <input id="account-keep" type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />
          <span>{t("keepSignedIn")}</span>
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {note ? <p className="text-sm font-semibold text-accent">{note}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {mode === "up" ? t("createAccount") : again ? t("signInAgain") : t("signIn")}
        </Button>
      </form>
      <Button variant="ghost" className="w-full" disabled={pending} onClick={() => void magic()}>
        {t("magicLink")}
      </Button>
    </div>
  );
}
