import { useRef, useState, type ReactNode } from "react";
import {
  Archive,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  ShieldCheck,
  Fingerprint,
  Droplets,
  EyeOff,
  Heart,
  HeartHandshake,
  Lock,
  MapPin,
  Moon,
  Palette,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Upload,
  UserRound,
  Users,
  Languages,
  X,
} from "lucide-react";
import { THEMES } from "@/lib/vela/catalog";
import { fmtDate, fmtShort } from "@/lib/vela/dates";
import { cleanMuted } from "@/lib/vela/stories";
import { cleanArchived } from "@/lib/vela/anniversaries";
import { ownerPerson, partnerPerson } from "@/lib/vela/people";
import { partnerKey } from "@/lib/vela/encounters";
import type { ArchivedPerson } from "@/lib/vela/types";
import { AppLockSettings, PassphraseNote, useLockBadge } from "./bio";
import { LockDiagnostics } from "./lock-diag";
import { notePicker } from "@/lib/vela/app-lock";
import { useLang, useT } from "@/lib/vela/i18n";
import { selectActiveCycle, useJournal } from "@/lib/vela/store";
import { MAX_TRACKERS, followsPartner, visibleTrackers, type CycleTracker } from "@/lib/vela/cycle-trackers";
import { fill, trackerLabel } from "@/lib/vela/cycle-words";
import { RemovePartnerDialog } from "./remove-partner-dialog";
import type { CopyKey } from "@/lib/vela/copy";
import type { JournalWipe } from "@/lib/vela/types";
import { cn } from "@/lib/cn";
import { Mark } from "./mark";
import { AccountPanel } from "./account-panel";
import { useCloud } from "@/lib/vela/sync";
import { CycleTune, useCycleUndo } from "./cycle-card";
import { CoupleSection } from "./couple-section";
import { AddTracker } from "./cycle-add";
import { Button, ConfirmDialog, MenuSelect, Switch, fieldClass, PassphraseInput } from "./ui";
import { MANUAL_CHAPTERS, MANUAL_TOPICS } from "@/lib/vela/manual";
import { SECTION_CLUSTER } from "@/lib/vela/settings-clusters";
import { Hint } from "./hint";
import { useBackLayer } from "@/lib/vela/back-stack";
import { APK_URL, androidBrowser } from "@/lib/vela/native";
import { APP_VERSION } from "@/lib/vela/version";

export function SettingsView() {
  const t = useT();
  const open = useJournal((s) => s.sections);
  const toggle = useJournal((s) => s.toggleSection);
  const openClusters = useJournal((s) => s.clusters);
  const toggleCluster = useJournal((s) => s.toggleCluster);
  // Back / gesture: a visible open section folds first, then its cluster,
  // then Settings closes — one layer at a time. A section left open inside
  // a closed cluster is not a visible layer and does not eat the gesture.
  const visibleSection = Object.keys(open).find((id) => open[id] && openClusters[SECTION_CLUSTER[id]]) ?? "";
  const openClusterId = Object.keys(openClusters).find((id) => openClusters[id]) ?? "";
  useBackLayer(Boolean(visibleSection || openClusterId), () => {
    const st = useJournal.getState();
    const sec = Object.keys(st.sections).find((key) => st.sections[key] && st.clusters[SECTION_CLUSTER[key]]);
    if (sec) {
      st.toggleSection(sec);
      return;
    }
    const cl = Object.keys(st.clusters).find((key) => st.clusters[key]);
    if (cl) st.toggleCluster(cl);
  }, { tier: 4, name: "settings-section" });
  const displayName = useJournal((s) => s.journal.profile?.displayName ?? "");
  const lockBadge = useLockBadge();
  const partnerCount = useJournal((s) => s.journal.partners.length);
  const cloudPhase = useJournal((s) => s.cloudPhase);
  const sessionGone = useCloud((s) => s.sessionGone);
  const language = useJournal((s) => s.journal.settings.language);
  const theme = useJournal((s) => s.journal.settings.theme);
  const cycleOn = useJournal((s) => visibleTrackers(s.journal.settings.cycles).length > 0);
  const mutedCount = useJournal((s) => {
    const m = cleanMuted(s.journal.settings.storiesMuted);
    return m.people.length + m.days.length;
  });
  const archivedCount = useJournal((s) => cleanArchived(s.journal.settings.archivedPeople).length);
  const dataBadge = sessionGone && cloudPhase === "signed-out" ? t("signInAgain") : cloudPhase === "saved" || cloudPhase === "saving" || cloudPhase === "offline" ? t("cloudBadge") : t("localBadge");

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 px-1 pt-1">
        <Mark className="mt-0.5 size-8" />
        <div>
          <h2 className="font-display text-3xl">{t("settings")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-dim">{t("settingsSub")}</p>
        </div>
      </div>
      <Cluster id="cl-personal" icon={<SlidersHorizontal className="size-5" />} title={t("clPersonal")} open={openClusters["cl-personal"]} onToggle={toggleCluster}>
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
      <Accordion id="prefs" icon={<Settings2 className="size-5" />} title={t("preferences")} open={open.prefs} onToggle={toggle}>
        <PrefsSection />
      </Accordion>
      </Cluster>
      <Cluster id="cl-people" icon={<Users className="size-5" />} title={t("clPeople")} open={openClusters["cl-people"]} onToggle={toggleCluster}>
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
      <Accordion
        id="memories"
        icon={<EyeOff className="size-5" />}
        title={t("storiesMutedTitle")}
        badge={mutedCount > 0 ? String(mutedCount) : undefined}
        open={open.memories}
        onToggle={toggle}
      >
        <MemoriesSection />
      </Accordion>
      <Accordion
        id="archive"
        icon={<Archive className="size-5" />}
        title={t("arcTitle")}
        badge={archivedCount > 0 ? String(archivedCount) : undefined}
        open={open.archive}
        onToggle={toggle}
      >
        <ArchiveSection />
      </Accordion>
      </Cluster>
      <Cluster id="cl-cycle" icon={<HeartHandshake className="size-5" />} title={t("clCycleCouple")} badges={[cycleOn ? t("cycleOn") : t("cycleOff")]} open={openClusters["cl-cycle"]} onToggle={toggleCluster}>
      <Accordion
        id="couple"
        icon={<Heart className="size-5" />}
        title={t("cpTitle")}
        open={open.couple}
        onToggle={toggle}
      >
        <CoupleSection />
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
      </Cluster>
      <Cluster id="cl-privacy" icon={<ShieldCheck className="size-5" />} title={t("clPrivacyData")} badges={[lockBadge, dataBadge]} open={openClusters["cl-privacy"]} onToggle={toggleCluster}>
      <Accordion id="privacy" icon={<Lock className="size-5" />} title={t("privacy")} badge={lockBadge} open={open.privacy} onToggle={toggle}>
        <PrivacySection />
      </Accordion>
      <Accordion id="data" icon={<Download className="size-5" />} title={t("dataSync")} badge={dataBadge} open={open.data} onToggle={toggle}>
        <DataSection />
      </Accordion>
      </Cluster>
      <Accordion id="manual" icon={<BookOpen className="size-5" />} title={t("mnTitle")} open={open.manual} onToggle={toggle}>
        <ManualSection />
      </Accordion>
      {androidBrowser() ? (
        <Accordion id="android" icon={<Smartphone className="size-5" />} title={language === "es" ? "Instalar app Android" : "Install the Android app"} badge="APK" open={open.android} onToggle={toggle}>
          <AndroidAppSection es={language === "es"} />
        </Accordion>
      ) : null}
      <p className="px-4 pt-3 text-center text-xs tracking-wide text-dim">{t("footer")}</p>
      <p className="px-4 pb-2 pt-1 text-center text-[11px] tracking-wide text-dim/70">{language === "es" ? "Versión" : "Version"} {APP_VERSION}</p>
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
          <span className="max-w-36 truncate rounded-full bg-accent-soft px-2 py-1 text-xs font-semibold text-accent">
            {badge}
          </span>
        ) : null}
        <ChevronDown className={cn("size-4 shrink-0 text-dim transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-border px-4 py-4">{children}</div> : null}
    </section>
  );
}

/* A cluster (2.2.9): a named area holding the sections that belong together.
 * Same panel skin as a section, one level up — its state pills are the live
 * state of what is inside (the lock, the account, the cycle), so the closed
 * row still tells the truth at a glance. */
function Cluster({
  id,
  icon,
  title,
  badges,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  badges?: string[];
  open?: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  const shown = (badges ?? []).filter(Boolean);
  return (
    <section className="ag-panel overflow-hidden rounded-card border border-border">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
        aria-expanded={Boolean(open)}
        onClick={() => onToggle(id)}
        data-testid={`cluster-${id}`}
      >
        <span className="text-accent">{icon}</span>
        <span className="min-w-0 flex-1 font-semibold">{title}</span>
        {shown.map((badge, index) => (
          <span key={index} className="max-w-36 truncate rounded-full bg-accent-soft px-2 py-1 text-xs font-semibold text-accent">
            {badge}
          </span>
        ))}
        <ChevronDown className={cn("size-4 shrink-0 text-dim transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="space-y-3 border-t border-border px-3 py-3">{children}</div> : null}
    </section>
  );
}

function ManualSection() {
  const t = useT();
  const openManual = useJournal((s) => s.openManual);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed text-dim">
          {fill(t("mnCounts"), { c: MANUAL_CHAPTERS.length, n: MANUAL_TOPICS.length })}
        </p>
        <Hint topic="el-manual" compact />
      </div>
      <Button className="w-full" onClick={() => openManual("")}>
        {t("mnOpen")}
      </Button>
    </div>
  );
}

function MemoriesSection() {
  const t = useT();
  const lang = useLang();
  const mutedRaw = useJournal((s) => s.journal.settings.storiesMuted);
  const muted = cleanMuted(mutedRaw);
  const unmuteStory = useJournal((s) => s.unmuteStory);
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-dim">{t("storiesMutedBody")}</p>
      {muted.people.map((name) => (
        <div key={`p-${name}`} className="flex items-center gap-3" data-testid="muted-person-row">
          <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
          <Button variant="ghost" onClick={() => unmuteStory("person", name)}>
            {t("storiesRestore")}
          </Button>
        </div>
      ))}
      {muted.days.map((day) => (
        <div key={`d-${day}`} className="flex items-center gap-3" data-testid="muted-day-row">
          <span className="min-w-0 flex-1 truncate font-medium">
            {fmtDate(day, lang)} <span className="text-sm font-normal text-dim">· {t("storiesMutedDay")}</span>
          </span>
          <Button variant="ghost" onClick={() => unmuteStory("day", day)}>
            {t("storiesRestore")}
          </Button>
        </div>
      ))}
    </div>
  );
}

/* The Archive (2.1.24) — people at rest. Nothing here is erased: each person
   keeps their whole history, and three switches in the user's own hand decide
   where their traces still appear. The only way out forever is the typed-name
   door, and it deletes everything that names them, without return. */
function ArchiveSection() {
  const t = useT();
  const archivedRaw = useJournal((s) => s.journal.settings.archivedPeople);
  const sessions = useJournal((s) => s.journal.sessions);
  const archived = cleanArchived(archivedRaw);
  const unarchivePerson = useJournal((s) => s.unarchivePerson);
  const setArchivedPref = useJournal((s) => s.setArchivedPref);
  const deletePersonForever = useJournal((s) => s.deletePersonForever);
  const coupleMode = useJournal((s) => s.journal.settings.coupleMode);
  const diaryPeople = useJournal((s) => s.journal.people);
  const proposeDeletion = useJournal((s) => s.proposeDeletion);
  const showToast = useJournal((s) => s.showToast);
  const [deleteAsk, setDeleteAsk] = useState<ArchivedPerson | null>(null);
  const [typed, setTyped] = useState("");
  if (archived.length === 0) {
    return <p className="flex items-start gap-2 text-sm leading-relaxed text-dim" data-spot="archive-section"><span className="flex-1">{t("arcEmpty")}</span><Hint topic="archivar" compact /></p>;
  }
  return (
    <div className="space-y-4" data-spot="archive-section">
      <div className="flex justify-end"><Hint topic="archivar" compact /></div>
      {archived.map((person) => {
        const kept = sessions.filter((s) => s.partnerName.toLowerCase() === person.name.toLowerCase()).length;
        return (
          <div key={person.name} className="space-y-2 border-b border-border pb-3" data-testid="archived-row">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">{person.name}</span>
              <span className="text-xs text-dim">{fill(t("arcMomentsKept"), { n: kept })}</span>
              <Button
                variant="ghost"
                onClick={() => {
                  unarchivePerson(person.name);
                  showToast(fill(t("arcRestoredToast"), { name: person.name }));
                }}
              >
                {t("arcRestore")}
              </Button>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("arcShowHistory")}</span>
              <Switch
                checked={person.showInHistory}
                label={t("arcShowHistory")}
                onChange={(v) => setArchivedPref(person.name, "showInHistory", v)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("arcCountStats")}</span>
              <Switch
                checked={person.countInStats}
                label={t("arcCountStats")}
                onChange={(v) => setArchivedPref(person.name, "countInStats", v)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("arcResurface")}</span>
              <Switch
                checked={person.resurface}
                label={t("arcResurface")}
                onChange={(v) => setArchivedPref(person.name, "resurface", v)}
              />
            </label>
            <button
              type="button"
              className="text-sm font-medium text-danger"
              data-testid="arc-delete"
              onClick={() => {
                setTyped("");
                setDeleteAsk(person);
              }}
            >
              {fill(t("arcDeleteForever"), { name: person.name })}
            </button>
          </div>
        );
      })}
      <ConfirmDialog
        open={Boolean(deleteAsk)}
        title={deleteAsk ? fill(t("arcDeleteTitle"), { name: deleteAsk.name }) : ""}
        confirmLabel={t("arcDeleteConfirm")}
        cancelLabel={t("cancelBtn")}
        confirmDisabled={!deleteAsk || typed.trim() !== deleteAsk.name}
        onConfirm={() => {
          if (deleteAsk) {
            // In a couple diary, erasing the partner — and everything of
            // theirs — takes both (2.2.3): the typed door deliberates, then
            // it becomes a proposal the partner must sign.
            const partner = partnerPerson(diaryPeople);
            const owner = ownerPerson(diaryPeople);
            if (coupleMode && partner && owner && partnerKey(deleteAsk.name) === partnerKey(partner.name)) {
              proposeDeletion({ kind: "delete-person", targetLabel: deleteAsk.name }, owner.id);
              showToast(fill(t("gvProposedToast"), { name: partner.name }));
            } else {
              deletePersonForever(deleteAsk.name);
              showToast(fill(t("arcDeletedToast"), { name: deleteAsk.name }));
            }
          }
          setDeleteAsk(null);
          setTyped("");
        }}
        onCancel={() => {
          setDeleteAsk(null);
          setTyped("");
        }}
      >
        <p className="text-sm leading-relaxed text-dim">{deleteAsk ? fill(t("arcDeleteBody"), { name: deleteAsk.name }) : ""}</p>
        <input
          className={fieldClass}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={t("arcNamePh")}
          aria-label={t("arcNamePh")}
          data-testid="arc-delete-input"
        />
      </ConfirmDialog>
    </div>
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
  const speakAs = useJournal((s) => s.journal.profile?.speakAs ?? "neutral");
  const setSpeakAs = useJournal((s) => s.setSpeakAs);
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
      <div className="border-t border-border pt-3">
        <p className="text-sm font-semibold">{t("profSpeakTitle")}</p>
        <p className="mt-1 text-sm leading-relaxed text-dim">{t("profSpeakBody")}</p>
        <div className="mt-2 grid grid-cols-3 gap-2" data-testid="speak-as">
          <Button variant={speakAs === "man" ? "primary" : "ghost"} onClick={() => setSpeakAs("man")}>
            {t("profSpeakMan")}
          </Button>
          <Button variant={speakAs === "woman" ? "primary" : "ghost"} onClick={() => setSpeakAs("woman")}>
            {t("profSpeakWoman")}
          </Button>
          <Button variant={speakAs === "neutral" ? "primary" : "ghost"} onClick={() => setSpeakAs("neutral")}>
            {t("profSpeakNeutral")}
          </Button>
        </div>
      </div>
      <Button variant="ghost" onClick={lock} data-spot="lock-now">
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
  const archivedRaw = useJournal((s) => s.journal.settings.archivedPeople);
  const archivedNames = new Set(cleanArchived(archivedRaw).map((p) => p.name.toLowerCase()));
  const archivePerson = useJournal((s) => s.archivePerson);
  const showToast = useJournal((s) => s.showToast);
  const [value, setValue] = useState("");
  const [drop, setDrop] = useState<string | null>(null);
  const [archiveAsk, setArchiveAsk] = useState<string | null>(null);
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
          {archivedNames.has(partner.toLowerCase()) ? (
            <span className="text-xs text-dim">{t("arcTitle")}</span>
          ) : (
            <button
              type="button"
              className="grid size-9 place-items-center rounded-control text-dim"
              aria-label={`${t("arcAction")} ${partner}`}
              data-testid="partner-archive"
              onClick={() => setArchiveAsk(partner)}
            >
              <Archive className="size-4" />
            </button>
          )}
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
      <ConfirmDialog
        open={Boolean(archiveAsk)}
        title={archiveAsk ? fill(t("arcQ"), { name: archiveAsk }) : ""}
        confirmLabel={t("arcAction")}
        cancelLabel={t("cancelBtn")}
        confirmTone="primary"
        onConfirm={() => {
          if (archiveAsk) {
            archivePerson(archiveAsk);
            showToast(fill(t("arcArchivedToast"), { name: archiveAsk }));
          }
          setArchiveAsk(null);
        }}
        onCancel={() => setArchiveAsk(null)}
      />
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
      <RemovePartnerDialog
        name={drop}
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
          <p className="flex items-center gap-2 font-semibold">{t("discreetMode")} <Hint topic="bloqueo" compact /></p>
          <p className="mt-1 text-sm text-dim">{t("discreetDesc")}</p>
        </div>
        <Switch checked={settings.discreet} label={t("discreetMode")} onChange={setDiscreet} />
      </div>
      <AppLockSettings />
      <PassphraseNote />
      <LockDiagnostics />
      <p className="font-semibold" data-spot="change-passphrase">{t("changePin")}</p>
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
  // "Remove this start" asks in its own row, then offers Undo for 8 s (it also drops that period's end).
  const [askStart, setAskStart] = useState<string | null>(null);
  // Back / gesture: the inline "remove this start?" question closes first.
  useBackLayer(askStart !== null, () => setAskStart(null), { name: "start-remove-ask" });
  const [removedStart, setRemovedStart] = useState("");
  const undoer = useCycleUndo();
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
            {undoer.pending ? (
              <div className="cy-rise flex items-center gap-2" data-testid="start-removed">
                <span className="min-w-0 flex-1 truncate text-sm text-dim">{fill(t("cyStartRemoved"), { d: removedStart })}</span>
                <Button variant="ghost" className="min-h-10 shrink-0 px-3" onClick={undoer.undo} data-testid="start-undo">
                  {t("cyUndo")}
                </Button>
              </div>
            ) : null}
            {[...tracker.starts].sort().reverse().map((date) => (
              <div key={date} className="flex items-center gap-2" data-testid="start-row">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {fmtShort(date, lang)}
                  {tracker.ends[date] ? <span className="text-dim"> – {fmtShort(tracker.ends[date], lang)}</span> : null}
                </span>
                {askStart === date ? (
                  <>
                    <Button variant="ghost" className="min-h-10 shrink-0 px-3" onClick={() => setAskStart(null)} data-testid="start-remove-no">
                      {t("cyConfirmNo")}
                    </Button>
                    <Button
                      className="min-h-10 shrink-0 px-3"
                      onClick={() => {
                        setAskStart(null);
                        setRemovedStart(fmtShort(date, lang));
                        undoer.change(() => removePeriodStart(date, tracker.id), tracker.id);
                      }}
                      data-testid="start-remove-yes"
                    >
                      {t("cyRemoveYes")}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" className="min-h-10 shrink-0 px-3" onClick={() => setAskStart(date)} data-testid="start-remove">
                    {t("cycleUnmarkDay")}
                  </Button>
                )}
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
      <Button variant="ghost" className="w-full" onClick={() => void exportJSON()} data-spot="backup-section">
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
      <p className="flex items-start gap-2 text-sm text-dim"><span className="flex-1">{t("backupTip")}</span><Hint topic="respaldo-rapido" compact /></p>
      <div className="flex items-center gap-2">
      <Button
        variant="danger"
        data-spot="erase-all"
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
      <Hint topic="borrar-todo" compact />
      </div>
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
          {rows.map((row) => {
            // Encounters can't outlive their sessions: removing sessions removes encounters too.
            const forced = row.key === "encounters" && wipe.sessions;
            const on = wipe[row.key] || forced;
            return (
              <button
                key={row.key}
                type="button"
                disabled={forced}
                aria-pressed={on}
                data-testid={`wipe-${row.key}`}
                className={cn("flex w-full items-center justify-between gap-3 py-2.5 text-left", forced && "opacity-60")}
                onClick={() => setWipe((current) => ({ ...current, [row.key]: !current[row.key] }))}
              >
                <span className="text-sm font-semibold">{row.label}</span>
                <span className={cn("text-xs font-semibold", on ? "text-danger" : "text-accent")}>
                  {on ? t("wipeRemove") : t("wipeKeep")}
                </span>
              </button>
            );
          })}
        </div>
        {wipe.encounters && !wipe.sessions ? (
          <p className="mt-2 text-xs leading-relaxed text-dim" data-testid="wipe-regroup-note">{t("wipeRegroupNote")}</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

/** Only on an Android phone or tablet in Chrome / the PWA (never inside the app, never on a computer). */
function AndroidAppSection({ es }: { es: boolean }) {
  return (
    <div className="space-y-3" data-testid="android-app">
      <p className="text-sm leading-relaxed text-dim">
        {es
          ? "Vela como su propia app en este teléfono: se abre con tu huella o el bloqueo de pantalla, y no aparece en Recientes. Se actualiza sola desde aquí."
          : "Vela as its own app on this phone: it opens with your fingerprint or screen lock and stays hidden in Recents. It updates itself from here."}
      </p>
      <p className="text-sm leading-relaxed text-dim">
        {es
          ? "La app guarda su diario aparte de Chrome. Antes, revisa en Datos y copias que diga Respaldo; en la app entra con tu cuenta y escribe tu frase una vez."
          : "The app keeps its journal apart from Chrome. First check that Data & Backup says Backup; in the app, sign in and type your passphrase once."}
      </p>
      <Button
        className="w-full"
        onClick={() => {
          location.href = APK_URL;
        }}
      >
        <Download className="size-4" />
        {es ? "Descargar Vela.apk" : "Download Vela.apk"}
      </Button>
      <p className="text-xs leading-relaxed text-dim">
        {es ? "Ábrelo e instala. Android puede pedirte permitir apps de Chrome." : "Open it and install. Android may ask you to allow apps from Chrome."}
      </p>
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
