/* The manual screen — a full layer over the app, in the fleet pattern:
 * cover, table of contents, every chapter rendered in full, an A–Z index,
 * and its own search. Arrival on a topic scrolls it in and glows it.
 * The bubble's words (`what`) are never rendered here — by law the bubble
 * and the entry are separate texts. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Search, X } from "lucide-react";
import {
  MANUAL_CHAPTERS,
  MANUAL_TOPICS,
  alphaIndex,
  findTopic,
  pick,
  topicText,
  type Go,
  type L,
  type Numbered,
  type Topic,
} from "@/lib/vela/manual";
import { LINKS } from "@/lib/vela/manual";
import { goToGo } from "@/lib/vela/manual-nav";
import { useJournal } from "@/lib/vela/store";
import { useLang, useT } from "@/lib/vela/i18n";
import { fill } from "@/lib/vela/cycle-words";
import { fold } from "@/lib/vela/batch";
import { useBackLayer } from "@/lib/vela/back-stack";
import { richText } from "./manual-text";

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-dim">{label}</p>
      <div className="mt-1.5 text-[15px] leading-relaxed text-fg/90">{children}</div>
    </div>
  );
}

function Cases({ text, onLink }: { text: string; onLink: (term: string) => void }) {
  return (
    <ul className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        const cut = line.indexOf(": ");
        const lead = cut >= 4 && cut <= 90 ? line.slice(0, cut + 1) : "";
        const rest = lead ? line.slice(cut + 2) : line;
        return (
          <li key={i} className="leading-relaxed">
            {lead ? <strong className="font-semibold text-fg">{lead} </strong> : null}
            {richText(rest, { onLink })}
          </li>
        );
      })}
    </ul>
  );
}

function TopicArticle({ topic, onJump, onLink }: { topic: Numbered; onJump: (id: string) => void; onLink: (term: string) => void }) {
  const t = useT();
  const lang = useLang();
  const p = (pair: L) => pick(lang, pair);
  return (
    <article id={`mn-${topic.id}`} className="scroll-mt-24 border-t border-border/60 py-6 first:border-t-0">
      <h3 className="font-display text-[22px] leading-snug">
        <span className="mr-2 text-dim">{topic.num}</span>
        {p(topic.title)}
      </h3>
      <p className="mt-2 text-[15px] font-medium leading-relaxed text-fg">{p(topic.sum)}</p>
      <Part label={t("mnHow")}>
        <ol className="space-y-1.5">
          {p(topic.how)
            .split("\n")
            .map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="font-semibold text-accent">{i + 1}.</span>
                <span>{richText(step, { onLink })}</span>
              </li>
            ))}
        </ol>
      </Part>
      {topic.calc ? (
        <Part label={t("mnCalc")}>
          <p>{richText(p(topic.calc), { onLink })}</p>
        </Part>
      ) : null}
      <Part label={t("mnExample")}>
        <p>{richText(p(topic.example), { onLink })}</p>
      </Part>
      {topic.cases ? (
        <Part label={t("mnCases")}>
          <Cases text={p(topic.cases)} onLink={onLink} />
        </Part>
      ) : null}
      {topic.mistake ? (
        <Part label={t("mnMistake")}>
          <p>{richText(p(topic.mistake), { onLink })}</p>
        </Part>
      ) : null}
      {topic.related?.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-dim">{t("mnRelated")}</span>
          {topic.related.map((id) => {
            const rel = findTopic(id);
            if (!rel) return null;
            return (
              <button
                key={id}
                type="button"
                className="min-h-[37px] rounded-full border border-border px-3 text-sm font-medium text-fg/85"
                onClick={() => onJump(id)}
              >
                {rel.num} {p(rel.title)}
              </button>
            );
          })}
        </div>
      ) : null}
      {topic.go ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex min-h-[37px] items-center gap-1.5 rounded-full bg-accent px-3.5 text-sm font-semibold text-bg"
            onClick={() => goToGo(topic.go!, topic.id)}
          >
            {t("mnSeeInApp")}
            <ArrowRight className="size-4" />
          </button>
          <span className="text-sm text-dim">{p(topic.go.where)}</span>
        </div>
      ) : null}
    </article>
  );
}

export function ManualView() {
  const t = useT();
  const lang = useLang();
  const manualTopic = useJournal((s) => s.manualTopic);
  const manualFrom = useJournal((s) => s.manualFrom);
  const openManual = useJournal((s) => s.openManual);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useBackLayer(true, () => openManual(null), { name: "manual" });

  const glow = (id: string) => {
    const el = document.getElementById(`mn-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.classList.remove("mn-glow");
    void el.offsetWidth;
    el.classList.add("mn-glow");
    window.setTimeout(() => el.classList.remove("mn-glow"), 3300);
  };

  useEffect(() => {
    if (manualTopic) {
      const topic = findTopic(manualTopic);
      if (topic) {
        setOpenChapter(topic.chapter.id);
        const id = window.setTimeout(() => glow(manualTopic), 90);
        return () => window.clearTimeout(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jump = (id: string) => {
    const topic = findTopic(id);
    if (!topic) return;
    setQuery("");
    setOpenChapter(topic.chapter.id);
    openManual(id);
    window.setTimeout(() => glow(id), 60);
  };

  const onLink = (term: string) => {
    const dest = LINKS[term];
    if (!dest) return;
    const topic = findTopic(dest.topic);
    // A link's own go names the SURFACE (the tab, the Settings root);
    // the destination topic's go names the CONTROL. The link's go used
    // to shadow the topic's entirely, so [[Home]], [[Calendar]] and
    // [[Statistics]] arrived with no spot at all and could never ring
    // (RT2-H5 B5'). When both gos land on the same surface, the topic's
    // spot completes the link's go; when they disagree (a generic
    // [[Settings]] against a topic deep in a section), the link's own
    // landing stands — the surface itself is the destination.
    const sameSurface = (a?: Go, b?: Go) =>
      Boolean(a && b && ((a.tab && a.tab === b.tab) || (a.settings !== undefined && a.settings === b.settings)));
    const go =
      dest.go && topic?.go && !dest.go.spot && topic.go.spot && sameSurface(dest.go, topic.go)
        ? { ...topic.go, ...dest.go, spot: topic.go.spot }
        : (dest.go ?? topic?.go);
    if (go) goToGo(go, dest.topic);
  };

  const hits = useMemo(() => {
    const words = fold(query)
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    if (!words.length) return [];
    const scored = MANUAL_TOPICS.map((topic) => {
      const title = fold(pick(lang, topic.title));
      const body = fold(topicText(topic, lang));
      if (!words.every((w) => body.includes(w))) return null;
      const tier = words.every((w) => title.includes(w)) ? 0 : words.some((w) => title.includes(w)) ? 1 : 2;
      return { topic, tier };
    }).filter((x): x is { topic: Numbered; tier: number } => x !== null);
    return scored.sort((a, b) => a.tier - b.tier).map((x) => x.topic);
  }, [query, lang]);

  const fromName =
    manualFrom === "settings"
      ? t("mnSettingsName")
      : manualFrom === "calendar"
        ? t("navCalendar")
        : manualFrom === "history"
          ? t("navHistory")
          : manualFrom === "insights"
            ? t("navInsights")
            : t("navHome");
  const searching = searchOpen && query.trim().length >= 2;

  return (
    <div ref={scrollRef} className="fixed inset-0 z-[60] overflow-y-auto bg-bg text-fg" role="dialog" aria-modal="true" aria-label={t("mnTitle")}>
      <div className="mx-auto w-full max-w-3xl px-4 pb-16">
        <div className="sticky top-0 z-10 -mx-4 border-b border-border/60 bg-bg/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-[37px] items-center gap-1.5 text-sm font-semibold text-fg/85"
              onClick={() => openManual(null)}
            >
              <ArrowLeft className="size-4" />
              {fill(t("mnBackTo"), { s: fromName })}
            </button>
            <span className="ml-auto font-display text-lg">{t("mnTitle")}</span>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border border-fg/25 text-fg/80"
              aria-label={t("mnSearchPh")}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            >
              {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
            </button>
          </div>
          {searchOpen ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("mnSearchPh")}
              className="mt-2.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] text-fg outline-none"
            />
          ) : null}
        </div>

        {searching ? (
          <div className="pt-4">
            {hits.length ? (
              <ul className="divide-y divide-border/60">
                {hits.map((topic) => (
                  <li key={topic.id}>
                    <button type="button" className="block w-full py-3 text-left" onClick={() => jump(topic.id)}>
                      <span className="text-sm text-dim">{topic.num} · {pick(lang, topic.chapter.title)}</span>
                      <span className="block font-display text-lg leading-snug">{pick(lang, topic.title)}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-dim">{pick(lang, topic.sum)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-dim">{t("mnNoResults")}</p>
            )}
          </div>
        ) : (
          <>
            <header className="pb-2 pt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">{t("mnKicker")}</p>
              <h2 className="mt-1.5 font-display text-3xl leading-tight">{t("mnPromise")}</h2>
              <p className="mt-2 text-sm text-dim">{fill(t("mnCounts"), { c: MANUAL_CHAPTERS.length, n: MANUAL_TOPICS.length })}</p>
              <a
                href="#mn-az"
                className="mt-3 inline-flex min-h-[37px] items-center rounded-full border border-border px-3.5 text-sm font-semibold"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("mn-az")?.scrollIntoView({ block: "start" });
                }}
              >
                {t("mnAZ")}
              </a>
            </header>

            <nav aria-label={t("mnTitle")} className="border-t border-border/60">
              {MANUAL_CHAPTERS.map((chapter, ci) => {
                const open = openChapter === chapter.id;
                return (
                  <div key={chapter.id} className="border-b border-border/60">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 py-3 text-left"
                      aria-expanded={open}
                      onClick={() => setOpenChapter(open ? null : chapter.id)}
                    >
                      <span className="text-dim">{ci + 1}.</span>
                      <span className="font-display text-lg">{pick(lang, chapter.title)}</span>
                      <span className="ml-auto text-sm text-dim">{chapter.topics.length}</span>
                      <ChevronDown className={`size-4 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open ? (
                      <ul className="pb-3">
                        {chapter.topics.map((topic) => (
                          <li key={topic.id}>
                            <button type="button" className="block w-full py-1.5 pl-6 text-left text-[15px] text-fg/85" onClick={() => jump(topic.id)}>
                              <span className="mr-2 text-dim">{MANUAL_TOPICS.find((x) => x.id === topic.id)?.num}</span>
                              {pick(lang, topic.title)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </nav>

            {MANUAL_CHAPTERS.map((chapter) => (
              <section key={chapter.id} className="pt-8">
                <h2 className="font-display text-2xl">
                  {pick(lang, chapter.title)}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-dim">{pick(lang, chapter.intro)}</p>
                {chapter.topics.map((topic) => {
                  const numbered = findTopic(topic.id)!;
                  return <TopicArticle key={topic.id} topic={numbered} onJump={jump} onLink={onLink} />;
                })}
              </section>
            ))}

            <section id="mn-az" className="scroll-mt-24 pt-10">
              <h2 className="font-display text-2xl">{t("mnAZ")}</h2>
              {alphaIndex(lang).map(({ letter, topics }) => (
                <div key={letter} className="mt-4">
                  <p className="text-sm font-semibold text-dim">{letter}</p>
                  <ul>
                    {topics.map((topic) => (
                      <li key={topic.id}>
                        <button type="button" className="block py-1 text-left text-[15px] text-fg/85" onClick={() => jump(topic.id)}>
                          <span className="mr-2 text-dim">{topic.num}</span>
                          {pick(lang, topic.title)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
