import { useEffect, useState } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import "./bio.css";
import { useJournal } from "@/lib/vela/store";
import { useT } from "@/lib/vela/i18n";
import { useBioT } from "@/lib/vela/bio-copy";
import { maybeOfferFingerprint, useBioUi } from "@/lib/vela/bio-offer";
import {
  bioFailCode,
  bioForUser,
  bioSupported,
  clearFingerprint,
  enrollFingerprint,
  enrollWithSession,
  keepStorage,
  platformAvailable,
  rememberPass,
  sessionPass,
  setOfferSkipped,
} from "@/lib/vela/fingerprint";
import type { CopyKey } from "@/lib/vela/copy";
import { cn } from "@/lib/cn";
import { Button, ConfirmDialog, fieldClass, PassphraseInput, Switch } from "./ui";

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

/** One-tap offer after a passphrase unlock: "Unlock with your fingerprint next time". */
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
              enrollWithSession(vaultId)
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
          <button
            type="button"
            className="vela-bio-dim mx-auto block min-h-10 text-xs underline"
            onClick={() => {
              setOfferSkipped(vaultId, true);
              close();
            }}
          >
            {bt("offerNever")}
          </button>
        </div>
      </div>
    </>
  );
}

/** Settings → Privacy: fingerprint unlock on / off, with a plain explanation. */
export function FingerprintSettings() {
  const t = useT();
  const bt = useBioT();
  const vaultId = useJournal((s) => s.vaultId);
  const keyEpoch = useJournal((s) => s.keyEpoch);
  const showToast = useJournal((s) => s.showToast);
  const tick = useBioUi((s) => s.tick);
  const bump = useBioUi((s) => s.bump);
  const [platform, setPlatform] = useState<boolean | null>(null);
  const [needPass, setNeedPass] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [askRemove, setAskRemove] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void platformAvailable().then(setPlatform);
  }, []);
  const enrolled = tick >= 0 && keyEpoch >= 0 && Boolean(vaultId && bioForUser(vaultId));

  const enroll = (pass: string) => {
    setPending(true);
    setError("");
    enrollFingerprint(pass, vaultId)
      .then(() => {
        rememberPass(pass);
        setOfferSkipped(vaultId, false);
        keepStorage();
        setPin("");
        setNeedPass(false);
        bump();
        showToast(t("bioSaved"));
      })
      .catch((err) => {
        const code = bioFailCode(err);
        if (code !== "cancel") setError(t(bioErrorKey(code)));
      })
      .finally(() => setPending(false));
  };

  const supported = bioSupported() && platform !== false;
  return (
    <div className="space-y-2 rounded-control border border-border px-3 py-3" data-testid="bio-settings">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold">
          <Fingerprint className="size-4 text-accent" />
          {bt("setTitle")}
        </p>
        {supported ? (
          <Switch
            checked={enrolled || needPass}
            label={bt("setTitle")}
            onChange={(next) => {
              if (!next) {
                if (enrolled) setAskRemove(true);
                else setNeedPass(false);
                return;
              }
              if (!vaultId) return;
              const pass = sessionPass();
              if (pass) enroll(pass);
              else setNeedPass(true);
            }}
          />
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-dim">
        {!bioSupported() ? t("bioUnsupported") : platform === false ? bt("setNoSensor") : enrolled ? bt("setOnBody") : bt("setOffBody")}
      </p>
      {needPass && !enrolled ? (
        <div className="space-y-2">
          <p className="text-sm">{bt("setNeedPass")}</p>
          <PassphraseInput
            id="bio-pass"
            className={fieldClass}
            value={pin}
            placeholder={t("currentPinPh")}
            onChange={(event) => setPin(event.target.value)}
          />
          <Button
            disabled={pending || !pin}
            onClick={() => {
              void useJournal
                .getState()
                .matchPassphrase(pin)
                .then((used) => {
                  if (used === null) setError(t("incorrectPin"));
                  else enroll(used);
                });
            }}
          >
            <Fingerprint className="size-4" /> {bt("setTurnOn")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={askRemove}
        title={t("bioRemoveQ")}
        confirmLabel={t("bioRemove")}
        cancelLabel={t("keep")}
        onCancel={() => setAskRemove(false)}
        onConfirm={() => {
          clearFingerprint();
          setOfferSkipped(vaultId, true);
          setAskRemove(false);
          bump();
          showToast(bt("bioOff"));
        }}
      />
    </div>
  );
}
