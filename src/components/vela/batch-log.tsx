import { useMemo, useState } from "react";
import { parseBatch } from "@/lib/vela/batch";
import { knownProblem } from "@/lib/vela/catalog";
import { fmtShort } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { useJournal } from "@/lib/vela/store";
import { Button, fieldClass } from "./ui";
import { cn } from "@/lib/cn";

const METHOD_KEY = {
  pullout: "methodPullout",
  pill: "methodPill",
  condom: "methodCondom",
  iud: "methodIud",
  implant: "methodImplant",
  none: "methodNone",
} as const;

export function BatchLog({ onSaved }: { onSaved: () => void }) {
  const t = useT();
  const lang = useLang();
  const saveBatch = useJournal((s) => s.saveBatch);
  const partners = useJournal((s) => s.journal.partners);
  const defaultPartner = useJournal((s) => s.journal.settings.defaultPartner);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(defaultPartner);
  const [typed, setTyped] = useState("");
  const entries = useMemo(() => parseBatch(text), [text]);
  const partner = typed.trim() || picked.trim();
  const placeholder =
    lang === "es"
      ? "1.ª vez. 3 mar 2024 de noche en casa. (Una vez)\n\n2.ª vez. 12 mar de tarde en un hotel. (Dos veces)\n\n3.ª vez. 20 mar en la playa. (Tres veces, al día siguiente.). Condón."
      : "1st time. Mar 3rd, 2024 at night at home. (Once)\n\n2nd time. Mar 12th in the afternoon at a hotel. (Twice)\n\n3rd time. Mar 20th at the beach. (Three times, the next day.). Condom.";

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-dim">{t("batchHint")}</p>
      <div>
        <p className="mb-2 text-sm font-semibold">{t("batchWith")}</p>
        <div className="flex flex-wrap gap-2">
          {partners.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={!typed && picked === name}
              className={cn(
                "min-h-10 rounded-full border px-3 text-sm font-semibold",
                !typed && picked === name ? "ag-chip-on" : "border-border text-fg",
              )}
              onClick={() => {
                setPicked(name);
                setTyped("");
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <input
          className={cn(fieldClass, "mt-3")}
          value={typed}
          placeholder={t("newPartnerPh")}
          aria-label={t("batchWith")}
          onChange={(event) => setTyped(event.target.value)}
        />
        <p className="mt-2 text-sm leading-relaxed text-dim">{partner || t("batchNeedPartner")}</p>
      </div>
      <textarea
        className={cn(fieldClass, "min-h-40 resize-y")}
        value={text}
        placeholder={placeholder}
        aria-label={t("batchTitle")}
        onChange={(event) => setText(event.target.value)}
      />
      {entries.length === 0 ? (
        <p className="text-sm text-dim">{t("batchEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, index) => (
            <li key={`${entry.date}-${index}`} className="rounded-control border border-border px-3 py-2 text-sm">
              <span className="font-semibold">{entry.title || t("encounter")}</span>
              <span className="text-dim">
                {" "}
                · {fmtShort(entry.date, lang)} · {entry.time} · {entry.place} · {entry.count} {t("batchSessions")}
                {entry.nextDay ? ` · ${t("throughTomorrow")}` : ""}
              </span>
              {entry.contraception.length > 0 ? (
                <span className="mt-1 block text-dim">
                  {entry.contraception
                    .map((id) => (id in METHOD_KEY ? t(METHOD_KEY[id as keyof typeof METHOD_KEY]) : id))
                    .join(" · ")}
                </span>
              ) : null}
              {entry.problems.length > 0 ? (
                <span className="mt-1 block text-dim">
                  {entry.problems.map((id) => (knownProblem(id) ? t(knownProblem(id)!) : id)).join(" · ")}
                </span>
              ) : null}
              {entry.notes ? <span className="mt-1 block">{entry.notes}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <Button
        className="w-full"
        disabled={entries.length === 0 || !partner}
        onClick={() => {
          if (!partner) return;
          saveBatch(entries, partner);
          setText("");
          setTyped("");
          onSaved();
        }}
      >
        {t("batchSave")}
      </Button>
    </div>
  );
}
