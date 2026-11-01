import { useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Download,
  ShieldCheck,
  Fingerprint,
  Droplets,
  Heart,
  Lock,
  MapPin,
  Moon,
  Palette,
  Settings2,
  Sun,
  Upload,
  UserRound,
  Languages,
  X,
} from "lucide-react";
import { THEMES } from "@/lib/vela/catalog";
import { fmtShort } from "@/lib/vela/dates";
import { AppLockSettings, PassphraseNote, useLockBadge } from "./bio";
import { notePicker } from "@/lib/vela/app-lock";
import { useLang, useT } from "@/lib/vela/i18n";
import { selectActiveCycle, useJournal } from "@/lib/vela/store";
import { MAX_TRACKERS, followsPartner, visibleTrackers, type CycleTracker } from "@/lib/vela/cycle-trackers";
import { fill, trackerLabel } from "@/lib/vela/cycle-words";
import type { CopyKey } from "@/lib/vela/copy";
import type { JournalWipe } from "@/lib/vela/types";
import { cn } from "@/lib/cn";
import { Mark } from "./mark";
import { AccountPanel } from "./account-panel";
import { useCloud } from "@/lib/vela/sync";
import { CycleTune } from "./cycle-card";
import { Button, ConfirmDialog, MenuSelect, Switch, fieldClass, PassphraseInput } from "./ui";

export function SettingsView() {
  const t = useT();
  const open = useJournal((s) => s.sections);
  const toggle = useJournal((s) => s.toggleSection);
  const displayName = useJournal((s) => s.journal.profile?.displayName ?? "");
  const lockBadge = useLockBadge();
  const partnerCount = useJournal((s) => s.journal.partners.length);
  const cloudPhase = useJournal((s) => s.cloudPhase);
  const sessionGone = useCloud((s) => s.sessionGone);
  const language = useJournal((s) => s.journal.settings.language);
  const theme = useJournal((s) => s.journal.settings.theme);
  const cycleOn = useJournal((s) => visibleTrackers(s.journal.settings.cycles).length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 px-1 pt-1">
        <Mark className="mt-0.5 size-8" />
        <div>
          <h2 className="font-display text-3xl">{t("settings")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-dim">{t("settingsSub")}</p>
        </div>
      </div>
      <Accordion
        id="language"
        icon={<Languages className="size-5" />}
        title={t("languageTitle")}
        badge={language === "es" ? "ES" : "EN"}
        open={open.language}
        onToggle={toggle}
      >
        <LanguageSection />
      </Accordion>
      <Accordion
        id="profile"
        icon={<UserRound className="size-5" />}
        title={t("profileAccount")}
        badge={displayName}
        open={open.profile}
        onToggle={toggle}
      >
        <ProfileSection />
      </Accordion>
      <Accordion
        id="appearance"
        icon={<Palette className="size-5" />}
        title={t("appearance")}
        badge={t(themeName(theme))}
        open={open.appearance}
        onToggle={toggle}
      >
        <AppearanceSection />
      </Accordion>
      <Accordion
        id="partners"
        icon={<Heart className="size-5" />}
        title={t("partners")}
        badge={String(partnerCount)}
        open={open.partners}
        onToggle={toggle}
      >
        <PartnersSection />
      </Accordion>
      <Accordion id="places" icon={<MapPin className="size-5" />} title={t("placesPositions")} open={open.places} onToggle={toggle}>
        <PlacesSection />
      </Accordion>
      <Accordion id="privacy" icon={<Lock className="size-5" />} title={t("privacy")} badge={lockBadge} open={open.privacy} onToggle={toggle}>
        <PrivacySection />
      </Accordion>
      <Accordion
        id="cycle"
        icon={<Droplets className="size-5" />}
        title={t("cycleTitle")}
        badge={cycleOn ? t("cycleOn") : t("cycleOff")}
        open={open.cycle}
        onToggle={toggle}
      >
        <CycleSection />
      </Accordion>
      <Accordion id="data" icon={<Download className="size-5" />} title={t("dataSync")} badge={sessionGone && cloudPhase === "signed-out" ? t("signInAgain") : cloudPhase === "saved" || cloudPhase === "saving" || cloudPhase === "offline" ? t("cloudBadge") : t("localBadge")} open={open.data} onToggle={toggle}>
        <DataSection />
      </Accordion>
      <Accordion id="prefs" icon={<Settings2 className="size-5" />} title={t("preferences")} open={open.prefs} onToggle={toggle}>
        <PrefsSection />
      </Accordion>
      <p className="px-4 pt-3 text-center text-xs tracking-wide text-dim">{t("footer")}</p>
    </div>
  );
}

function themeName(theme: string): CopyKey {
  const found = THEMES.find((item) => item.id === theme);
  return (found?.name ?? "themeVelvetName") as CopyKey;
}

function Accordion({
  id,
  icon,
  title,
  badge,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  badge?: string;
  open?: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="ag-panel overflow-hidden rounded-card border border-border">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
        aria-expanded={Boolean(open)}
        onClick={() => onToggle(id)}
      >
        <span className="text-accent">{icon}</span>
        <span className="min-w-0 flex-1 font-semibold">{title}</span>
        {badge ? (
          <span className="max-w-28 truncate rounded-full bg-accent-soft px-2 py-1 text-xs font-semibold text-accent">
            {badge}
          </span>
        ) : null}
        <ChevronDown className={cn("size-4 shrink-0 text-dim transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-border px-4 py-4">{children}</div> : null}
    </section>
  );
}

function LanguageSection() {
  const t = useT();
  const language = useJournal((s) => s.journal.settings.language);
  const setLanguage = useJournal((s) => s.setLanguage);
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-dim">{t("languageBody")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant={language === "en" ? "primary" : "ghost"} onClick={() => setLanguage("en")}>
          English
        </Button>
        <Button variant={language === "es" ? "primary" : "ghost"} onClick={() => setLanguage("es")}>
          Español
        </Button>
      </div>
    </div>
  );
}

function ProfileSection() {
  const t = useT();
  const name = useJournal((s) => s.journal.profile?.displayName ?? "");
  const save = useJournal((s) => s.saveDisplayName);
  const lock = useJournal((s) => s.lock);
  const [value, setValue] = useState(name);
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="display-name">
        {t("displayName")}
      </label>
      <input id="display-name" className={fieldClass} value={value} onChange={(event) => setValue(event.target.value)} />
      <Button className="w-full" aria-label={t("saveDisplayAria")} onClick={() => save(value)}>
        {t("save")}
      </Button>
      <p className="text-sm leading-relaxed text-dim">{t("localProfileNote")}</p>
      <Button variant="ghost" onClick={lock}>
        <Lock className="size-4" /> {t("lockNow")}
      </Button>
    </div>
  );
}

function AppearanceSection() {
  const t = useT();
  const settings = useJournal((s) => s.journal.settings);
  const toggleMode = useJournal((s) => s.toggleMode);
  const setTheme = useJournal((s) => s.setTheme);
  const setRating = useJournal((s) => s.setRatingStyle);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {settings.mode === "night" ? <Moon className="size-5 text-accent" /> : <Sun className="size-5 text-accent" />}
        <span className="flex-1 font-semibold">{settings.mode === "night" ? t("nightMode") : t("dayMode")}</span>
        <Button className="min-h-10 rounded-full px-4" aria-label={t("toggleModeAria")} onClick={toggleMode}>
          {settings.mode === "night" ? t("switchToDay") : t("switchToNight")}
        </Button>
      </div>
      <div className="space-y-2" role="listbox" aria-label={t("themeAria")}>
        {THEMES.map((theme) => {
          const selected = settings.theme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setTheme(theme.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-card border px-3 py-3 text-left",
                selected ? "border-accent bg-surface-2" : "border-border",
              )}
            >
              <span className="size-10 shrink-0 rounded-full" style={{ background: `var(--swatch-${theme.id})` }} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t(theme.name)}</span>
                <span className="block text-sm text-dim">{t(theme.desc)}</span>
              </span>
              {selected ? <span className="text-accent">✓</span> : null}
            </button>
          );
        })}
      </div>
      <p className="text-sm font-semibold">{t("ratingStyle")}</p>
      <MenuSelect
        id="rating-style"
        label={t("ratingStyle")}
        value={settings.ratingStyle}
        onChange={(value) => setRating(value)}
        options={[
          { value: "flame", label: t("styleFlame") },
          { value: "star", label: t("styleStar") },
          { value: "heart", label: t("styleHeart") },
        ]}
      />
    </div>
  );
}

function PartnersSection() {
  const t = useT();
  const partners = useJournal((s) => s.journal.partners);
  const defaultPartner = useJournal((s) => s.journal.settings.defaultPartner);
  const setDefaultPartner = useJournal((s) => s.setDefaultPartner);
  const add = useJournal((s) => s.addPartner);
  const remove = useJournal((s) => s.removePartner);
  const [value, setValue] = useState("");
  const [drop, setDrop] = useState<string | null>(null);
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{t("defaultPartner")}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={defaultPartner === ""}
          className={cn(
            "min-h-[37px] rounded-full border px-[0.85rem] text-[0.8rem] font-semibold",
            defaultPartner === "" ? "ag-chip-on" : "ag-pill border-border text-fg",
          )}
          onClick={() => setDefaultPartner("")}
        >
          {t("defaultNone")}
        </button>
        {partners.map((partner) => (
          <button
            key={partner}
            type="button"
            aria-pressed={defaultPartner === partner}
            className={cn(
              "min-h-[37px] rounded-full border px-[0.85rem] text-[0.8rem] font-semibold",
              defaultPartner === partner ? "ag-chip-on" : "ag-pill border-border text-fg",
            )}
            onClick={() => setDefaultPartner(partner)}
          >
            {partner}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-dim">{t("defaultPartnerHint")}</p>
      <div className="mt-4">
      {partners.length === 0 ? <p className="text-sm leading-relaxed text-dim">{t("noPartnersYet")}</p> : null}
      {partners.map((partner) => (
        <div key={partner} className="flex items-center gap-3 border-b border-border py-2">
          <span className="min-w-0 flex-1 truncate font-medium">{partner}</span>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-control text-danger"
            aria-label={`${t("removePartnerAria")} ${partner}`}
            onClick={() => setDrop(partner)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <div className="mt-3 flex gap-2">
        <input
          className={fieldClass}
          value={value}
          placeholder={t("settingsPartnerPh")}
          aria-label={t("settingsPartnerPh")}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          aria-label={t("addPartnerAria")}
          onClick={() => {
            add(value);
            setValue("");
          }}
        >
          {t("add")}
        </Button>
      </div>
      <ConfirmDialog
        open={drop !== null}
        title={t("confirmRemoveQ")}
        name={drop ?? ""}
        confirmLabel={t("yesDelete")}
        cancelLabel={t("keep")}
        onCancel={() => setDrop(null)}
        onConfirm={() => {
          if (drop) remove(drop);
          setDrop(null);
        }}
      />
      </div>
    </div>
  );
}

function PlacesSection() {
  const t = useT();
  const places = useJournal((s) => s.journal.settings.customPlaces);
  const positions = useJournal((s) => s.journal.settings.customPositions);
  const problems = useJournal((s) => s.journal.settings.customProblems);
  const add = useJournal((s) => s.addCustom);
  const remove = useJournal((s) => s.removeCustom);
  return (
    <div className="space-y-4">
      <CustomList
        title={t("yourCustomPlaces")}
        empty={t("noCustomPlaces")}
        items={places}
        placeholder={t("newPlacePh")}
        onAdd={(value) => add("places", value)}
        onRemove={(value) => remove("places", value)}
      />
      <CustomList
        title={t("yourCustomPositions")}
        empty={t("noCustomPositions")}
        items={positions}
        placeholder={t("newPosPh")}
        onAdd={(value) => add("positions", value)}
        onRemove={(value) => remove("positions", value)}
      />
      <CustomList
        title={t("yourCustomProblems")}
        empty={t("noCustomProblems")}
        items={problems}
        placeholder={t("problemPh")}
        onAdd={(value) => add("problems", value)}
        onRemove={(value) => remove("problems", value)}
      />
    </div>
  );
}

function CustomList({
  title,
  empty,
  items,
  placeholder,
  onAdd,
  onRemove,
}: {
  title: string;
  empty: string;
  items: string[];
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [drop, setDrop] = useState<string | null>(null);
  return (
    <div>
      <p className="mb-2 font-semibold">{title}</p>
      {items.length === 0 ? <p className="text-sm text-dim">{empty}</p> : null}
      {items.map((item) => (
        <div key={item} className="flex items-center gap-3 border-b border-border py-2">
          <span className="min-w-0 flex-1 truncate">{item}</span>
          <button type="button" className="text-danger" onClick={() => setDrop(item)} aria-label={item}>
            <X className="size-4" />
          </button>
        </div>
      ))}
      <div className="mt-3 flex gap-2">
        <input className={fieldClass} value={value} placeholder={placeholder} onChange={(event) => setValue(event.target.value)} />
        <Button
          onClick={() => {
            onAdd(value);
            setValue("");
          }}
        >
          {t("add")}
        </Button>
      </div>
      <ConfirmDialog
        open={drop !== null}
        title={t("confirmRemoveQ")}
        name={drop ?? ""}
        confirmLabel={t("yesDelete")}
        cancelLabel={t("keep")}
        onCancel={() => setDrop(null)}
        onConfirm={() => {
          if (drop) onRemove(drop);
          setDrop(null);
        }}
      />
    </div>
  );
}

function PrivacySection() {
  const t = useT();
  const settings = useJournal((s) => s.journal.settings);
  const setDiscreet = useJournal((s) => s.setDiscreet);
  const changePassphrase = useJournal((s) => s.changePassphrase);
  const showToast = useJournal((s) => s.showToast);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("discreetMode")}</p>
          <p className="mt-1 text-sm text-dim">{t("discreetDesc")}</p>
        </div>
        <Switch checked={settings.discreet} label={t("discreetMode")} onChange={setDiscreet} />
      </div>
      <AppLockSettings />
      <PassphraseNote />
      <p className="font-semibold">{t("changePin")}</p>
      <PassphraseInput id="change-current" className={fieldClass} value={current} placeholder={t("currentPinPh")} onChange={(event) => setCurrent(event.target.value)} />
      <PassphraseInput id="change-next" className={fieldClass} value={next} placeholder={t("newPinPh")} onChange={(event) => setNext(event.target.value)} />
      <p className="text-xs leading-relaxed text-dim">{t("passWarn")}</p>
      <Button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void changePassphrase(current, next).then((result) => {
            setBusy(false);
            if (result === "ok") {
              setMessage("");
              setCurrent("");
              setNext("");
              showToast(t("pinUpdated"));
            } else setMessage(result === "short" ? t("pinPh") : t("pinUpdateError"));
          });
        }}
      >
        {t("updatePin")}
      </Button>
      {message ? (
        <p className="text-sm text-danger" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function CycleSection() {
  const t = useT();
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const active = useJournal(selectActiveCycle);
  const [editId, setEditId] = useState(active.id);
  const editing = cycles.find((tracker) => tracker.id === editId) ?? active;
  const multi = cycles.length > 1;
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-dim">{t("cycleBody")}</p>
      {multi ? (
        <div>
          <p className="mb-2 text-sm font-semibold">{t("cyPeopleTitle")}</p>
          <div className="flex flex-wrap gap-2" data-testid="cycle-trackers">
            {cycles.map((tracker) => {
              const on = tracker.id === editing.id;
              return (
                <button
                  key={tracker.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setEditId(tracker.id)}
                  className={cn(
                    "inline-flex min-h-[37px] max-w-full items-center gap-1.5 rounded-full border px-[0.85rem] text-[0.8rem] font-semibold",
                    on ? "ag-chip-on" : "ag-pill border-border text-fg",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", tracker.enabled ? "cy-bg-period" : "bg-fg/20")} />
                  <span className="min-w-0 truncate">{trackerLabel(tracker, t)}</span>
                  {!tracker.enabled ? <span className="shrink-0 font-medium text-dim">· {t("cyPaused")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <TrackerEditor key={editing.id} tracker={editing} multi={multi} onRemoved={() => setEditId("")} />
      <AddTracker onAdded={setEditId} />
    </div>
  );
}

function TrackerEditor({ tracker, multi, onRemoved }: { tracker: CycleTracker; multi: boolean; onRemoved: () => void }) {
  const t = useT();
  const lang = useLang();
  const partners = useJournal((s) => s.journal.partners);
  const store = useJournal((s) => s.setCycle);
  const removePeriodStart = useJournal((s) => s.removePeriodStart);
  const removeTracker = useJournal((s) => s.removeTracker);
  const [name, setName] = useState(tracker.partnerName);
  const [confirm, setConfirm] = useState(false);
  const setCycle = (partial: Parameters<typeof store>[0]) => store(partial, tracker.id);
  const label = trackerLabel(tracker, t);
  const linkOptions = [
    { value: "", label: t("cyLinkNone") },
    ...[...new Set([...partners, ...(tracker.partnerLink ? [tracker.partnerLink] : [])])].map((partner) => ({ value: partner, label: partner })),
  ];
  return (
    <div className="space-y-4" data-testid="cycle-tracker-editor">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 font-semibold">{multi ? t("cyTrackerOn") : t("cycleEnable")}</span>
        <Switch checked={tracker.enabled} label={multi ? `${t("cyTrackerOn")} · ${label}` : t("cycleTitle")} onChange={(enabled) => setCycle({ enabled })} />
      </div>
      {multi && !tracker.enabled ? <p className="-mt-2 text-xs leading-relaxed text-dim">{t("cyPausedHint")}</p> : null}
      {tracker.enabled ? (
        <>
          <div>
            <p className="mb-2 text-sm font-semibold">{t("cyPerspective")}</p>
            <div className="ag-seg grid grid-cols-2 gap-1 rounded-card p-1" role="group" aria-label={t("cyPerspective")} data-testid="cycle-perspective">
              {(["self", "partner"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tracker.perspective === value}
                  onClick={() => setCycle({ perspective: value })}
                  className={cn(
                    "ag-seg-btn min-h-11 rounded-[0.85rem] px-2 text-xs leading-tight font-semibold",
                    tracker.perspective === value ? "ag-pick" : "text-dim",
                  )}
                >
                  {t(value === "self" ? "cyPerspSelf" : "cyPerspPartner")}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-dim">{t(tracker.perspective === "partner" ? "cyPerspPartnerHint" : "cyPerspSelfHint")}</p>
            {tracker.perspective === "partner" && multi ? (
              <div className="mt-3">
                <span className="mb-1.5 block text-sm font-semibold">{t("cyLinkPartner")}</span>
                <MenuSelect
                  id={`cycle-link-${tracker.id}`}
                  label={t("cyLinkPartner")}
                  value={tracker.partnerLink}
                  options={linkOptions}
                  onChange={(partnerLink) => setCycle({ partnerLink, partnerName: partnerLink || name })}
                />
                <p className="mt-2 text-xs leading-relaxed text-dim">{t("cyLinkHint")}</p>
              </div>
            ) : null}
            {tracker.perspective === "partner" && !tracker.partnerLink ? (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-sm font-semibold">{t("cyHerName")}</span>
                <input
                  className={fieldClass}
                  value={name}
                  maxLength={40}
                  placeholder={t("cyHerNamePh")}
                  data-testid="cycle-tracker-name"
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => setCycle({ partnerName: name })}
                />
              </label>
            ) : null}
          </div>
          <CycleTune id={tracker.id} />
          <p className="text-sm font-semibold">{t("cycleStarts")}</p>
          {tracker.starts.length === 0 ? <p className="text-sm text-dim">{t("cycleNoStarts")}</p> : null}
          <div className="space-y-2">
            {[...tracker.starts].sort().reverse().map((date) => (
              <div key={date} className="flex items-center gap-2">
                <span className="flex-1 text-sm">
                  {fmtShort(date, lang)}
                  {tracker.ends[date] ? <span className="text-dim"> – {fmtShort(tracker.ends[date], lang)}</span> : null}
                </span>
                <Button variant="ghost" className="min-h-10 px-3" onClick={() => removePeriodStart(date, tracker.id)}>
                  {t("cycleUnmarkDay")}
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {multi ? (
        <>
          <Button variant="ghost" className="w-full text-danger" onClick={() => setConfirm(true)} data-testid="cycle-tracker-remove">
            <X className="size-4" /> {t("cyRemoveTracker")}
          </Button>
          <ConfirmDialog
            open={confirm}
            title={tracker.perspective === "partner" ? fill(t("cyRemoveTrackerQ"), { name: label }) : t("cyRemoveTrackerSelfQ")}
            confirmLabel={t("cyRemoveYes")}
            cancelLabel={t("keep")}
            onCancel={() => setConfirm(false)}
            onConfirm={() => {
              setConfirm(false);
              removeTracker(tracker.id);
              onRemoved();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function AddTracker({ onAdded }: { onAdded: (id: string) => void }) {
  const t = useT();
  const cycles = useJournal((s) => s.journal.settings.cycles);
  const partners = useJournal((s) => s.journal.partners);
  const addTracker = useJournal((s) => s.addTracker);
  const setCycle = useJournal((s) => s.setCycle);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"self" | "partner">("partner");
  const [name, setName] = useState("");
  if (cycles.length >= MAX_TRACKERS) return null;
  const hasSelf = cycles.some((tracker) => tracker.perspective === "self" && (tracker.enabled || tracker.starts.length > 0));
  const free = partners.filter((partner) => !cycles.some((tracker) => followsPartner(tracker, partner)));
  const add = (perspective: "self" | "partner", partnerName = "", partnerLink = "") => {
    const only = cycles.length === 1 ? cycles[0] : null;
    let id: string;
    if (only && !only.enabled && only.starts.length === 0) {
      // An unused, switched-off first cycle is simply reused instead of leaving an empty one behind.
      setCycle({ enabled: true, perspective, partnerName, partnerLink }, only.id);
      useJournal.getState().selectCycle(only.id);
      id = only.id;
    } else {
      id = addTracker({ perspective, partnerName, partnerLink });
    }
    if (id) onAdded(id);
    setOpen(false);
    setName("");
  };
  if (!open) {
    return (
      <Button variant="ghost" className="w-full" onClick={() => { setKind(hasSelf ? "partner" : kind); setOpen(true); }} data-testid="cycle-add-tracker">
        + {t("cyAddPerson")}
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-card border border-border bg-surface-2/50 p-3" data-testid="cycle-add-panel">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("cyAddPerson")}</p>
          <p className="mt-1 text-xs leading-relaxed text-dim">{t("cyAddPersonHint")}</p>
        </div>
        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full text-dim" aria-label={t("closeEdit")} onClick={() => setOpen(false)}>
          <X className="size-4" />
        </button>
      </div>
      <div className="ag-seg grid grid-cols-2 gap-1 rounded-card p-1" role="group" aria-label={t("cyPerspective")}>
        {(["self", "partner"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={value === "self" && hasSelf}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={cn("ag-seg-btn min-h-10 rounded-[0.85rem] px-2 text-xs leading-tight font-semibold disabled:opacity-40", kind === value ? "ag-pick" : "text-dim")}
          >
            {t(value === "self" ? "cyAddSelf" : "cyAddPartner")}
          </button>
        ))}
      </div>
      {kind === "self" ? (
        <Button className="w-full" onClick={() => add("self")}>
          {t("add")}
        </Button>
      ) : (
        <>
          {free.length ? (
            <div className="flex flex-wrap gap-2">
              {free.map((partner) => (
                <button
                  key={partner}
                  type="button"
                  className="ag-pill inline-flex min-h-[37px] max-w-full items-center rounded-full border border-border px-[0.85rem] text-[0.8rem] font-semibold text-fg"
                  onClick={() => add("partner", partner, partner)}
                  data-testid="cycle-add-partner"
                >
                  <span className="min-w-0 truncate">+ {partner}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              className={cn(fieldClass, "min-w-0 flex-1")}
              value={name}
              maxLength={40}
              placeholder={t("cyHerNamePh")}
              aria-label={t("cyHerName")}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              className="shrink-0 px-4"
              disabled={!name.trim()}
              onClick={() => {
                const typed = name.trim();
                const saved = partners.find((partner) => partner.toLocaleLowerCase() === typed.toLocaleLowerCase());
                add("partner", saved ?? typed, saved ?? "");
              }}
            >
              {t("add")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function DataSection() {
  const t = useT();
  const exportJSON = useJournal((s) => s.exportJSON);
  const exportCSV = useJournal((s) => s.exportCSV);
  const importBackup = useJournal((s) => s.importBackup);
  const showToast = useJournal((s) => s.showToast);
  const confirm = useJournal((s) => s.confirmErase);
  const setConfirm = useJournal((s) => s.setConfirmErase);
  const erase = useJournal((s) => s.eraseAll);
  const fileRef = useRef<HTMLInputElement>(null);
  const [wipe, setWipe] = useState<JournalWipe>({
    sessions: true,
    encounters: true,
    partners: false,
    places: false,
    positions: false,
    problems: false,
  });
  const chosen = Object.values(wipe).some(Boolean);
  const rows: { key: keyof JournalWipe; label: string }[] = [
    { key: "sessions", label: t("wipeSessions") },
    { key: "encounters", label: t("wipeEncounters") },
    { key: "partners", label: t("wipePartners") },
    { key: "places", label: t("wipePlaces") },
    { key: "positions", label: t("wipePositions") },
    { key: "problems", label: t("wipeProblems") },
  ];
  return (
    <div className="space-y-3">
      <AccountPanel />
      <p className="text-sm leading-relaxed">
        <span className="mr-2 inline-block size-2 rounded-full bg-accent" />
        <b>{t("localDataA")}</b>
      </p>
      <p className="text-sm leading-relaxed text-dim">{t("localDataBody")}</p>
      <Button variant="ghost" className="w-full" onClick={() => void exportJSON()}>
        <Download className="size-4" /> {t("exportJson")}
      </Button>
      <Button variant="ghost" className="w-full" onClick={exportCSV}>
        <Download className="size-4" /> {t("exportCsv")}
      </Button>
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => {
          notePicker();
          fileRef.current?.click();
        }}
      >
        <Upload className="size-4" /> {t("importJson")}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result ?? "");
            void (async () => {
              let result = await importBackup(text);
              if (!result.ok && result.reason === "needs-pass") {
                const pass = window.prompt(t("backupPassPrompt")) ?? "";
                if (!pass) return;
                result = await importBackup(text, pass);
              }
              if (result.ok) showToast(`${t("importedA")} ${result.n} ${t("importedB")}`);
              else showToast(result.reason === "bad-pass" ? t("backupBadPass") : t("importInvalid"));
            })();
          };
          reader.onerror = () => showToast(t("importError"));
          reader.readAsText(file);
        }}
      />
      <p className="text-sm text-dim">{t("backupTip")}</p>
      <Button
        variant="danger"
        onClick={() => {
          setWipe({
            sessions: true,
            encounters: true,
            partners: false,
            places: false,
            positions: false,
            problems: false,
          });
          setConfirm(true);
        }}
      >
        {t("eraseAll")}
      </Button>
      <ConfirmDialog
        open={confirm}
        title={t("eraseAll")}
        name={t("eraseConfirmQ")}
        confirmLabel={t("yesErase")}
        cancelLabel={t("keep")}
        confirmDisabled={!chosen}
        onCancel={() => setConfirm(false)}
        onConfirm={() => erase(wipe)}
      >
        <div className="mt-3 divide-y divide-border">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
              onClick={() => setWipe((current) => ({ ...current, [row.key]: !current[row.key] }))}
            >
              <span className="text-sm font-semibold">{row.label}</span>
              <span className={cn("text-xs font-semibold", wipe[row.key] ? "text-danger" : "text-accent")}>
                {wipe[row.key] ? t("wipeRemove") : t("wipeKeep")}
              </span>
            </button>
          ))}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function PrefsSection() {
  const t = useT();
  const weekStart = useJournal((s) => s.journal.settings.weekStart);
  const setWeek = useJournal((s) => s.setWeekStart);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{t("weekStarts")}</p>
      <MenuSelect
        id="week-start"
        label={t("weekStarts")}
        value={weekStart}
        onChange={(value) => setWeek(value)}
        options={[
          { value: "monday", label: t("monday") },
          { value: "sunday", label: t("sunday") },
        ]}
      />
      <p className="text-sm leading-relaxed text-dim">{t("weekStartNote")}</p>
      <p className="text-sm leading-relaxed text-dim">{t("tabletTip")}</p>
    </div>
  );
}
