import { useRef, useState } from "react";
import { knownProblem, placeLabel, positionLabel } from "@/lib/vela/catalog";
import type { CopyKey } from "@/lib/vela/copy";
import { fmtDate, fmtDuration, fmtShort, fmtTime } from "@/lib/vela/dates";
import { useLang, useT } from "@/lib/vela/i18n";
import { ratingLabel } from "@/lib/vela/notes";
import { useJournal } from "@/lib/vela/store";
import type { Session } from "@/lib/vela/types";
import { RATING_KEYS } from "@/lib/vela/types";
import { cn } from "@/lib/cn";
import { Button, ConfirmDialog, RatingIcon } from "./ui";
import { PhaseDot } from "./cycle-card";

const METHOD_KEY = {
  pullout: "methodPullout",
  pill: "methodPill",
  condom: "methodCondom",
  iud: "methodIud",
  implant: "methodImplant",
  none: "methodNone",
} as const;

export function SessionCard({ session, density = "list" }: { session: Session; density?: "list" | 2 | 3 | 4 }) {
  if (density !== "list") return <CompactSession session={session} density={density} />;
  const t = useT();
  const lang = useLang();
  const style = useJournal((s) => s.journal.settings.ratingStyle);
  const encounters = useJournal((s) => s.journal.encounters);
  const allSessions = useJournal((s) => s.journal.sessions);
  const encounter = encounters.find((item) => item.id === session.encounterId);
  const kin = encounter ? allSessions.filter((item) => item.encounterId === encounter.id) : [];
  const confirm = useJournal((s) => s.confirmDeleteId === session.id);
  const setConfirm = useJournal((s) => s.setConfirmDelete);
  const remove = useJournal((s) => s.deleteSession);
  const addRound = useJournal((s) => s.addRound);
  const openEdit = useJournal((s) => s.openEdit);
  const showToast = useJournal((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [askRound, setAskRound] = useState(false);
  const [showKin, setShowKin] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef(0);
  const lastTap = useRef(0);
  const ratings = RATING_KEYS.filter((key) => session[key] > 0)
    .map((key) => `${t(key)}: ${ratingLabel(lang, key, session[key])}`)
    .join(" · ");

  return (
    <div className="relative overflow-hidden rounded-card" data-noswipe>
      <div className="absolute inset-y-0 right-0 flex w-36">
        <button
          type="button"
          className="flex-1 bg-chip text-xs font-semibold text-accent"
          onClick={() => {
            setConfirm(null);
            setAskRound(true);
            setOpen(false);
          }}
        >
          +1
        </button>
        <button
          type="button"
          className="flex-1 bg-surface-2 text-xs font-semibold"
          onClick={() => {
            openEdit(session.id);
            setOpen(false);
          }}
        >
          {t("edit")}
        </button>
        <button
          type="button"
          className="flex-1 bg-wine text-xs font-semibold text-fg"
          onClick={() => {
            setConfirm(session.id);
            setOpen(false);
          }}
        >
          {t("delete")}
        </button>
      </div>
      <article
        className={cn("ag-panel relative rounded-card border border-border p-4 transition-transform", open && "-translate-x-36")}
        style={drag ? { transform: `translateX(${drag}px)` } : undefined}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          start.current = { x: touch.clientX, y: touch.clientY };
          setDrag(0);
        }}
        onTouchMove={(event) => {
          if (!start.current) return;
          const touch = event.touches[0];
          const dx = touch.clientX - start.current.x;
          const dy = touch.clientY - start.current.y;
          if (Math.abs(dy) > Math.abs(dx)) return;
          const base = open ? -144 : 0;
          const next = Math.max(-144, Math.min(0, base + dx));
          dragRef.current = next;
          setDrag(next);
        }}
        onTouchEnd={() => {
          if (dragRef.current < -56) setOpen(true);
          else setOpen(false);
          dragRef.current = 0;
          setDrag(0);
          start.current = null;
        }}
      >
        <div
          className="w-full text-left"
          onClick={() => {
            const now = Date.now();
            if (now - lastTap.current < 320) {
              lastTap.current = 0;
              openEdit(session.id);
              return;
            }
            lastTap.current = now;
          }}
        >
        <div className="flex items-start gap-3">
          <div className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-surface-2 text-accent">
            <RatingIcon style={style} className="size-4" />
            <span className="text-[10px] font-semibold leading-none">#{session.sessionNumber}</span>
          </div>
          <div className="min-w-0 flex-1 space-y-1 pt-0.5">
            <h3 className="font-display text-xl leading-tight">
              {session.partnerName ? (lang === "es" ? "Con" : "With") : ""}
              {session.partnerName ? ` ${session.partnerName}` : t("soloMoment")}
              <span className="font-sans text-base font-medium text-dim"> · {placeLabel(lang, session.place)}</span>
            </h3>
            <p className="text-sm leading-snug">
              <PhaseDot date={session.date} className="mr-1.5 -mt-0.5" />
              <span className="font-semibold text-accent">{fmtDate(session.date, lang)}</span>
              <span className="text-dim"> · {fmtTime(session.time, lang)}</span>
            </p>
            <p className="text-sm leading-snug text-dim">
              {session.durationMins ? `${fmtDuration(session.durationMins)} · ` : ""}
              {t("sessionThatDay")} {session.sessionNumber} {t("thatDay")}
            </p>
            {encounter ? (
              <button
                type="button"
                className="rounded-full border border-accent/45 bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowKin((value) => !value);
                }}
              >
                {t("encounter")}
                {encounter.title.trim() ? ` · ${encounter.title.trim()}` : ""}
              </button>
            ) : null}
            {showKin ? (
              <div className="space-y-1 pt-1">
                {kin.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-xl border border-border px-2.5 py-1.5 text-left text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(item.id);
                    }}
                  >
                    <span className="font-semibold text-accent">{fmtDate(item.date, lang)}</span>
                    <span className="text-dim"> · {fmtTime(item.time, lang)} · {t("sessionThatDay")} {item.sessionNumber}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-3 space-y-2">
        {session.positions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {session.positions.map((position) => (
              <span key={position} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                {positionLabel(lang, position)}
              </span>
            ))}
          </div>
        ) : null}
        {(session.problems ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {(session.problems ?? []).map((id) => (
              <span key={id} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-dim">
                {problemName(t, id)}
              </span>
            ))}
          </div>
        ) : null}
        {ratings ? <p className="text-xs leading-relaxed text-dim">{ratings}</p> : null}
        {session.notes || session.ownWords ? (
          <div className="rounded-2xl border border-accent/35 bg-surface-2/45 px-3.5 py-3">
            {session.notes ? <p className="text-sm leading-relaxed">“{session.notes}”</p> : null}
            {session.ownWords ? <p className={cn("text-sm leading-relaxed text-dim", session.notes && "mt-1.5")}>{session.ownWords}</p> : null}
          </div>
        ) : null}
        {(session.contraception ?? []).length > 0 ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {(session.contraception ?? []).map((id) => (
              <span key={id} className="rounded-full border border-accent/45 bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                {id in METHOD_KEY ? t(METHOD_KEY[id as keyof typeof METHOD_KEY]) : id}
              </span>
            ))}
          </div>
        ) : null}
        </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex items-center" aria-label={`${session.overall} ${t("of5")}`}>
            {[1, 2, 3, 4, 5].map((level) => (
              <RatingIcon key={level} style={style} className="size-4" active={session.overall >= level} />
            ))}
          </div>
          <Button
            variant="ghost"
            className="ml-auto min-h-10 px-3"
            onClick={() => {
              setConfirm(null);
              setAskRound(true);
            }}
          >
            +1
          </Button>
        </div>
        <ConfirmDialog
          open={askRound}
          title={t("addRoundQ")}
          confirmLabel={t("yesAddRound")}
          cancelLabel={t("keep")}
          confirmTone="primary"
          onCancel={() => setAskRound(false)}
          onConfirm={() => {
            addRound(session.id);
            showToast(t("addedRound"));
            setAskRound(false);
          }}
        />
        <ConfirmDialog
          open={confirm}
          title={t("deleteConfirmQ")}
          name={session.partnerName || undefined}
          confirmLabel={t("yesDelete")}
          cancelLabel={t("keep")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => remove(session.id)}
        />
      </article>
    </div>
  );
}

function CompactSession({ session, density }: { session: Session; density: 2 | 3 | 4 }) {
  const t = useT();
  const lang = useLang();
  const style = useJournal((s) => s.journal.settings.ratingStyle);
  const openEdit = useJournal((s) => s.openEdit);
  const tight = density === 4;
  const mid = density === 3;
  const name = session.partnerName || t("soloMoment");
  return (
    <article className="ag-panel min-w-0 rounded-card border border-border">
      <button
        type="button"
        className={cn("block w-full text-left", tight ? "p-1.5" : mid ? "p-2" : "p-2.5")}
        onClick={() => openEdit(session.id)}
      >
        <p className={cn("font-semibold leading-tight", tight ? "line-clamp-2 text-[10px]" : mid ? "line-clamp-2 text-[11px]" : "line-clamp-2 text-sm")}>
          {name}
          {density === 2 ? <span className="font-medium text-dim"> · {placeLabel(lang, session.place)}</span> : null}
        </p>
        <p className={cn("mt-0.5 text-dim", tight ? "text-[9px] leading-tight" : "text-[10px]")}>
          <PhaseDot date={session.date} className="mr-1 size-1.5" />
          {fmtShort(session.date, lang)}
          {density < 4 ? ` · ${fmtTime(session.time, lang)}` : ""}
        </p>
        <span className="mt-1 flex" aria-label={`${session.overall} ${t("of5")}`}>
          {[1, 2, 3, 4, 5].map((level) => (
            <RatingIcon key={level} style={style} className={tight ? "size-2" : "size-2.5"} active={session.overall >= level} />
          ))}
        </span>
        {density === 2 && session.ownWords ? (
          <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-dim">{session.ownWords}</p>
        ) : null}
        {density === 2 && !session.ownWords && session.notes ? (
          <p className="mt-1 line-clamp-3 text-[11px] leading-snug">{session.notes}</p>
        ) : null}
        {density === 3 && (session.ownWords || session.notes) ? (
          <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-dim">{session.ownWords || session.notes}</p>
        ) : null}
      </button>
    </article>
  );
}

function problemName(t: (key: CopyKey) => string, id: string) {
  const known = knownProblem(id);
  return known ? t(known) : id;
}
