import { useEffect, useState } from "react";
import { Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";
import "./bio.css";
import { useJournal } from "@/lib/vela/store";
import { useT } from "@/lib/vela/i18n";
import { useBioT } from "@/lib/vela/bio-copy";
import { maybeOfferFingerprint, useBioUi } from "@/lib/vela/bio-offer";
import { bioFailCode, bioSupported, platformAvailable, sessionPass } from "@/lib/vela/fingerprint";
import { appLockOn, enrollAppLock, LOCK_AFTER_OPTIONS, lockAfterMs, lockRecord, markOfferDone, setAppLockOn, setLockAfter } from "@/lib/vela/app-lock";
import type { CopyKey } from "@/lib/vela/copy";
import { cn } from "@/lib/cn";
import { Button, Switch } from "./ui";

export function bioErrorKey(code: string): CopyKey {
  return code === "mismatch"
    ? "bioMismatch"
    : code === "insecure"
      ? "bioInsecure"
      : code === "unsupported"
        ? "bioUnsupported"
        : code === "already"
          ? "bioAlready"
          : code === "missing"
            ? "bioMissing"
            : "bioFailed";
}

export function BioButton({
  asking,
  label,
  onClick,
  small,
}: {
  asking: boolean;
  label: string;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("vela-bio-btn", small && "vela-bio-small")}
      data-asking={asking ? "true" : "false"}
      data-testid="bio-unlock"
      aria-label={label}
      onClick={onClick}
    >
      <Fingerprint strokeWidth={1.5} />
    </button>
  );
}

/** Once per owner, after the journal opens: "Lock Vela with your fingerprint". */
export function BioOffer() {
  const bt = useBioT();
  const t = useT();
  const vaultId = useJournal((s) => s.vaultId);
  const showToast = useJournal((s) => s.showToast);
  const offer = useBioUi((s) => s.offer);
  const setOffer = useBioUi((s) => s.setOffer);
  const bump = useBioUi((s) => s.bump);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Give the journal a moment to paint before asking.
    const id = window.setTimeout(() => void maybeOfferFingerprint(vaultId), 700);
    return () => window.clearTimeout(id);
  }, [vaultId]);

  if (!offer) return null;
  const close = () => {
    markOfferDone();
    setOffer(false);
    setError("");
  };
  return (
    <>
      <div className="vela-bio-sheet-backdrop" onClick={close} aria-hidden />
      <div className="vela-bio-sheet" role="dialog" aria-modal="true" aria-labelledby="bio-offer-title" data-testid="bio-offer">
        <div className="vela-bio-btn vela-bio-small" aria-hidden>
          <Fingerprint strokeWidth={1.5} />
        </div>
        <h2 id="bio-offer-title" className="mt-4 text-center font-display text-2xl leading-tight">
          {bt("offerTitle")}
        </h2>
        <p className="vela-bio-dim mt-2 text-center text-sm leading-relaxed">{bt("offerBody")}</p>
        <p className="vela-bio-gold mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold">
          <ShieldCheck className="size-3.5" /> {bt("offerSafe")}
        </p>
        {error ? (
          <p className="mt-3 text-center text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 space-y-2">
          <button
            type="button"
            className="vela-bio-cta"
            disabled={pending}
            data-testid="bio-offer-yes"
            onClick={() => {
              setPending(true);
              setError("");
              enrollAppLock(vaultId, sessionPass())
                .then(() => {
                  bump();
                  close();
                  showToast(t("bioSaved"));
                })
                .catch((err) => {
                  const code = bioFailCode(err);
                  if (code !== "cancel") setError(t(bioErrorKey(code)));
                })
                .finally(() => setPending(false));
            }}
          >
            <Fingerprint className="size-5" /> {bt("offerYes")}
          </button>
          <button type="button" className="vela-bio-ghost" onClick={close} data-testid="bio-offer-later">
            {bt("offerLater")}
          </button>
        </div>
      </div>
    </>
  );
}

const AFTER_KEY: Record<number, "after0" | "after10" | "after60" | "after300"> = { 0: "after0", 10000: "after10", 60000: "after60", 300000: "after300" };

/** Short label for the Privacy & Security row. */
export function useLockBadge() {
  const bt = useBioT();
  const tick = useBioUi((s) => s.tick);
  void tick;
  if (!appLockOn()) return bt("badgeOff");
  return lockRecord() && bioSupported() ? bt("badgeOn") : bt("badgeNone");
}

/** Settings → Privacy: the app lock (fingerprint / screen lock) and how soon it locks after leaving. */
export function AppLockSettings() {
  const t = useT();
  const bt = useBioT();
  const vaultId = useJournal((s) => s.vaultId);
  const lock = useJournal((s) => s.lock);
  const showToast = useJournal((s) => s.showToast);
  const tick = useBioUi((s) => s.tick);
  const bump = useBioUi((s) => s.bump);
  const [platform, setPlatform] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void platformAvailable().then(setPlatform);
  }, []);
  void tick;
  const on = appLockOn();
  const enrolled = Boolean(lockRecord());
  const after = lockAfterMs();
  const supported = bioSupported() && platform !== false;

  const enroll = () => {
    setPending(true);
    setError("");
    enrollAppLock(vaultId, sessionPass())
      .then(() => {
        bump();
        showToast(t("bioSaved"));
      })
      .catch((err) => {
        const code = bioFailCode(err);
        if (code !== "cancel") setError(t(bioErrorKey(code)));
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="vela-lock-card space-y-3 rounded-control border border-border px-3 py-3" data-testid="app-lock" data-on={on ? "true" : "false"} data-enrolled={enrolled ? "true" : "false"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="vela-lock-glyph" aria-hidden>
            <Fingerprint className="size-5" strokeWidth={1.6} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{bt("lockTitle")}</span>
            <span className="block text-xs tracking-wide text-dim">{bt("lockSub")}</span>
          </span>
        </div>
        {supported ? (
          <Switch
            checked={on && enrolled}
            label={bt("lockTitle")}
            onChange={(next) => {
              setError("");
              if (!next) {
                setAppLockOn(false);
                bump();
                showToast(bt("lockOffToast"));
                return;
              }
              setAppLockOn(true);
              bump();
              if (!enrolled) enroll();
            }}
          />
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-dim" data-testid="app-lock-status">
        {!bioSupported() ? t("bioUnsupported") : platform === false ? bt("setNoSensor") : !on ? bt("lockOffBody") : enrolled ? bt("lockOnBody") : bt("lockSetupBody")}
      </p>
      {supported && on && !enrolled ? (
        <Button className="w-full" disabled={pending} onClick={enroll} data-testid="lock-setup">
          <Fingerprint className="size-4" /> {bt("lockSetup")}
        </Button>
      ) : null}
      {on && (enrolled || !supported) ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold" id="lock-after-label">
            {bt("lockAfter")}
          </p>
          <div className="ag-seg grid grid-cols-[1.45fr_1fr_1fr_1fr] gap-1 rounded-card p-1" role="radiogroup" aria-labelledby="lock-after-label" data-testid="lock-after">
            {LOCK_AFTER_OPTIONS.map((ms) => {
              const picked = after === ms;
              return (
                <button
                  key={ms}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  data-after={ms}
                  onClick={() => {
                    setLockAfter(ms);
                    bump();
                  }}
                  className={cn("ag-seg-btn min-h-11 whitespace-nowrap rounded-[0.85rem] px-1 text-[0.82rem] font-semibold", picked ? "ag-pick" : "text-dim")}
                >
                  {bt(AFTER_KEY[ms])}
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-dim">{bt("afterHint")}</p>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {on ? (
        <Button className="w-full" variant="ghost" onClick={lock} data-testid="lock-now">
          <Lock className="size-4" /> {t("lockNow")}
        </Button>
      ) : null}
      {supported && on && enrolled ? (
        <button type="button" className="mx-auto block min-h-10 text-xs text-dim underline underline-offset-4" disabled={pending} onClick={enroll} data-testid="lock-redo">
          {bt("lockRedo")}
        </button>
      ) : null}
    </div>
  );
}

/** Settings → Privacy: what the passphrase is for now. */
export function PassphraseNote() {
  const bt = useBioT();
  return (
    <div className="vela-pass-note flex items-start gap-3 rounded-control px-3 py-3" data-testid="pass-note">
      <KeyRound className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{bt("passNoteTitle")}</p>
        <p className="mt-1 text-xs leading-relaxed text-dim">{bt("passNoteBody")}</p>
      </div>
    </div>
  );
}
