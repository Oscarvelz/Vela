/* The couple diary (2.2) — its Settings home. The turn-on is a ceremony in
   three short steps, confirmed by both people: the law (no secrets inside a
   shared account), the scope (where the shared diary begins), and the people
   (names + the PIN each one signs with). Once on, this section is the ledger:
   what is shared, what stays personal — re-readable forever, per the design. */
import { useState } from "react";
import { fill } from "@/lib/vela/cycle-words";
import { fmtDate, todayStr } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { hashPin, ownerPerson, partnerPerson } from "@/lib/vela/people";
import { useJournal } from "@/lib/vela/store";
import { Button, ConfirmDialog, fieldClass } from "./ui";
import { cn } from "@/lib/cn";

const pinOk = (pin: string) => /^\d{4,6}$/.test(pin);

export function CoupleSection() {
  const t = useT();
  const lang = useLang();
  const coupleMode = useJournal((s) => s.journal.settings.coupleMode);
  const people = useJournal((s) => s.journal.people);
  const partners = useJournal((s) => s.journal.partners);
  const profileName = useJournal((s) => s.journal.profile?.displayName ?? "");
  const firstSessionDate = useJournal((s) => s.journal.sessions.reduce((min, x) => (min === "" || x.date < min ? x.date : min), ""));
  const enableCoupleMode = useJournal((s) => s.enableCoupleMode);
  const disableCoupleMode = useJournal((s) => s.disableCoupleMode);

  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<"all" | "today" | "pick">("today");
  const [pickDate, setPickDate] = useState(todayStr());
  const [partnerName, setPartnerName] = useState("");
  const [pinA, setPinA] = useState("");
  const [pinB, setPinB] = useState("");
  const [busy, setBusy] = useState(false);
  const [askOff, setAskOff] = useState(false);

  if (coupleMode) {
    const owner = ownerPerson(people);
    const partner = partnerPerson(people);
    return (
      <div className="space-y-3" data-testid="couple-on">
        <p className="text-sm leading-relaxed">
          {fill(t("cpOnBody"), { a: owner?.name ?? profileName, b: partner?.name ?? "", date: fmtDate(coupleMode.sharedFrom, lang) })}
        </p>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-dim">{t("cpLedgerTitle")}</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-dim">
            <li>{t("cpLedgerShared")}</li>
            <li>{t("cpLedgerVoice")}</li>
            <li>{t("cpLedgerWhole")}</li>
            <li>{t("cpLedgerExit")}</li>
          </ul>
        </div>
        <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={() => setAskOff(true)}>
          {t("cpTurnOff")}
        </Button>
        <ConfirmDialog
          open={askOff}
          title={t("cpTurnOff")}
          confirmLabel={t("cpTurnOff")}
          cancelLabel={t("cancelBtn")}
          onCancel={() => setAskOff(false)}
          onConfirm={() => {
            setAskOff(false);
            disableCoupleMode();
          }}
        >
          <p className="text-sm leading-relaxed text-dim">{t("cpTurnOffBody")}</p>
        </ConfirmDialog>
      </div>
    );
  }

  const pinsValid = pinOk(pinA) && pinOk(pinB) && pinA !== pinB;
  const ready = partnerName.trim().length > 0 && pinsValid && !busy;

  const turnOn = async () => {
    setBusy(true);
    try {
      const [ownerPinHash, partnerPinHash] = await Promise.all([hashPin(pinA), hashPin(pinB)]);
      const sharedFrom = scope === "all" ? firstSessionDate || todayStr() : scope === "pick" ? pickDate : todayStr();
      enableCoupleMode({ partnerName: partnerName.trim(), sharedFrom, ownerPinHash, partnerPinHash });
      setStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="couple-off">
      {step === 0 ? (
        <>
          <p className="text-sm leading-relaxed text-dim">{t("cpOffBody")}</p>
          <Button className="min-h-11 px-4" onClick={() => setStep(1)}>
            {t("cpBegin")}
          </Button>
        </>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <p className="font-display text-lg">{t("cpStepLawTitle")}</p>
          <p className="text-sm leading-relaxed">{t("cpStepLawBody")}</p>
          <div className="flex gap-2">
            <Button variant="ghost" className="min-h-10 px-3" onClick={() => setStep(0)}>
              {t("cpBack")}
            </Button>
            <Button className="min-h-10 px-4" onClick={() => setStep(2)}>
              {t("cpNext")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <p className="font-display text-lg">{t("cpStepScopeTitle")}</p>
          <p className="text-sm leading-relaxed text-dim">{t("cpScopeBody")}</p>
          <div className="flex flex-wrap gap-2">
            {(["all", "today", "pick"] as const).map((value) => (
              <Button
                key={value}
                variant={scope === value ? "primary" : "ghost"}
                className="min-h-10 px-3 text-sm"
                onClick={() => setScope(value)}
              >
                {t(value === "all" ? "cpScopeAll" : value === "today" ? "cpScopeToday" : "cpScopePick")}
              </Button>
            ))}
          </div>
          {scope === "pick" ? (
            <input type="date" className={fieldClass} value={pickDate} max={todayStr()} onChange={(e) => setPickDate(e.target.value)} />
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" className="min-h-10 px-3" onClick={() => setStep(1)}>
              {t("cpBack")}
            </Button>
            <Button className="min-h-10 px-4" onClick={() => setStep(3)}>
              {t("cpNext")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <p className="font-display text-lg">{t("cpStepPeopleTitle")}</p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dim">{t("cpPartnerName")}</span>
            <input className={fieldClass} value={partnerName} list="couple-partner-names" onChange={(e) => setPartnerName(e.target.value)} />
            <datalist id="couple-partner-names">
              {partners.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dim">
              {fill(t("cpYourPin"), {})} — {profileName}
            </span>
            <input
              className={fieldClass}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinA}
              onChange={(e) => setPinA(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dim">{t("cpTheirPin")}</span>
            <input
              className={fieldClass}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinB}
              onChange={(e) => setPinB(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <p className={cn("text-xs leading-relaxed", pinA && pinB && pinA === pinB ? "font-semibold text-[var(--ag-accent)]" : "text-dim")}>
            {pinA && pinB && pinA === pinB ? t("cpPinSame") : t("cpPinHint")}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="min-h-10 px-3" onClick={() => setStep(2)}>
              {t("cpBack")}
            </Button>
            <Button className="min-h-10 px-4" disabled={!ready} onClick={() => void turnOn()}>
              {t("cpTurnOn")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
