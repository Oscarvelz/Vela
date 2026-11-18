/* WAVE17-ERASURE-STAMPS — Round 4 Wave 1 (2.2.40): erasure and the
 * stamp economy, second act (RT4-H1 B1/B3/B4, RT4-H3 B2/L1, RT4-H4
 * B2). eraseAll mints the partner off-stamps every other removal door
 * mints, and the merge's roster screen judges a stale side's partners
 * by their own on-stamps, not the journal's birthday; the forever
 * erasure scrubs the batch draft that names her; the last raw-clock
 * writers (voice saves and deletes, session edits, quiet marks,
 * pregnancy tests) mint through stampNow; stampNow's scan reads
 * encounter edit stamps; a quiet mark keeps its birth stamp across
 * edits. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave17-erasure-stamps.ts */
import { journalFromUnknown, mergeJournals, stampNow, useJournal } from "../src/lib/vela/store";
import type { Journal } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { holds += 1; console.log(`HOLD ${name}`); }
  else { breaks += 1; console.log(`BREAK ${name}${detail ? ` — ${detail}` : ""}`); }
}

const DAY = 86400000;
const now = Date.now();
const BIG = 9_999_999_999_999; // beyond any real clock: a stamp from a set-forward device
const OWNER = { id: "p-owner", name: "Ana", role: "owner", createdAt: now - 60 * DAY, updatedAt: now - 60 * DAY };

function base(partners: string[], updatedAt: number, extra: Record<string, unknown> = {}): Journal {
  return journalFromUnknown(
    {
      profile: { displayName: "Ana", createdAt: now - 60 * DAY },
      settings: { language: "en", weekStart: "mon" },
      partners,
      sessions: [],
      encounters: [],
      people: [OWNER],
      updatedAt,
      ...extra,
    },
    "en",
  );
}
function drive(journal: Journal) {
  useJournal.setState({ journal, unlocked: true });
  return useJournal.getState();
}

/* ——— S1: eraseAll's partners stay erased at the merge ——— */
{
  const a = base(["Lucía", "Sofía"], 10_000);
  const erased = (() => { const st = drive(a); st.eraseAll({ sessions: false, encounters: false, partners: true, places: false, positions: false, problems: false }); return useJournal.getState().journal; })();
  check("S1 eraseAll empties the roster", erased.partners.length === 0);
  // The stale device makes an unrelated later save: its journal stamp
  // jumps past the cut, carrying the pre-erase roster.
  const stale = base(["Lucía", "Sofía"], 0, {});
  const staleSaved = { ...stale, updatedAt: (erased.partnersClearedAt ?? 0) + 500_000 };
  const m1 = mergeJournals(erased, staleSaved);
  check("S1 erased partners stay erased (erased, stale)", m1.partners.length === 0, JSON.stringify(m1.partners));
  const m2 = mergeJournals(staleSaved, erased);
  check("S1 erased partners stay erased (stale, erased)", m2.partners.length === 0, JSON.stringify(m2.partners));
  // Control: a partner born on the stale device AFTER the cut, through
  // the real add door (which mints her on-stamp), survives the merge.
  const born = (() => { const st = drive(staleSaved); st.addPartner("Marco"); return useJournal.getState().journal; })();
  const m3 = mergeJournals(erased, born);
  check("S1 control: a partner born after the cut survives", m3.partners.includes("Marco"), JSON.stringify(m3.partners));
  check("S1 control: the erased stay erased beside him", !m3.partners.includes("Lucía") && !m3.partners.includes("Sofía"));
}

/* ——— S2: the forever erasure scrubs the batch draft ——— */
{
  const withDraft = base(["Lucía"], 10_000, {
    settings: {
      language: "en", weekStart: "mon",
      batchDraft: { text: "Oct 25 with Lucía, twice, condom", picked: "", typed: "Lucía", edits: {}, open: true, at: 9_000 },
    },
    sessions: [{ id: "s1", date: "2026-10-20", partnerName: "Lucía", createdAt: 8_000 }],
  });
  const st = drive(withDraft);
  st.deletePersonForever("Lucía");
  const after = useJournal.getState().journal;
  check("S2 the draft naming her is gone", !after.settings.batchDraft, JSON.stringify(after.settings.batchDraft));
  // And a stale side still holding the draft cannot restore it.
  const m = mergeJournals(after, withDraft);
  check("S2 the merge does not restore her draft", !m.settings.batchDraft || !(m.settings.batchDraft.typed === "Lucía"));
  check("S2 she stays off the roster after the merge", !m.partners.includes("Lucía"));
  // Control: a draft naming someone else is untouched.
  const other = base(["Lucía", "Sofía"], 10_000, {
    settings: {
      language: "en", weekStart: "mon",
      batchDraft: { text: "Oct 25 with Sofía, twice", picked: "", typed: "Sofía", edits: {}, open: true, at: 9_000 },
    },
  });
  const st2 = drive(other);
  st2.deletePersonForever("Lucía");
  check("S2 control: another person's draft survives", useJournal.getState().journal.settings.batchDraft?.typed === "Sofía");
}

/* ——— S3/S4: the stamp economy has no raw-clock writers left ——— */
{
  const loaded = base(["Ana"], 10_000, {
    sessions: [{ id: "s1", date: "2026-10-20", partnerName: "Ana", createdAt: 8_000, updatedAt: 8_000 }],
    deleted: { "far-future": BIG },
  });
  const encOnly = base(["Ana"], 10_000, {
    encounters: [{ id: "e1", createdAt: 5, updatedAt: BIG, startDate: "2026-10-20", endDate: "2026-10-20", title: "", partnerName: "", comment: "", problems: [] }],
  });
  check("S4 stampNow outranks an encounter's edit stamp", stampNow(encOnly) > BIG, `stampNow=${stampNow(encOnly)}`);
  const st = drive(loaded);
  st.savePartnerVoice("s1", { intensity: 3, connection: 3, satisfaction: 3, energy: 3, overall: 4, ownWords: "warm", by: "p-owner" });
  let s1 = useJournal.getState().journal.sessions.find((s) => s.id === "s1");
  check("S3 savePartnerVoice stamps through stampNow", (s1?.partnerVoice?.updatedAt ?? 0) > BIG && (s1?.updatedAt ?? 0) > BIG, `voice=${s1?.partnerVoice?.updatedAt} session=${s1?.updatedAt}`);
  st.deletePartnerVoice("s1");
  s1 = useJournal.getState().journal.sessions.find((s) => s.id === "s1");
  check("S3 deletePartnerVoice stamps through stampNow", (s1?.updatedAt ?? 0) > BIG && !s1?.partnerVoice);
  st.saveEdit("s1", { date: "2026-10-21", time: "21:00", partnerName: "Ana", newPartner: "", place: "Bedroom", customPlace: "", durationMins: 30, positions: [], contraception: [], problems: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 5, notes: "", ownWords: "", encounterId: "", encounterTitle: "", encounterStart: "", encounterEnd: "", encounterProblems: [] } as never);
  s1 = useJournal.getState().journal.sessions.find((s) => s.id === "s1");
  check("S3 saveEdit stamps through stampNow", (s1?.updatedAt ?? 0) > BIG, `updatedAt=${s1?.updatedAt}`);
  st.addPregnancyTests([{ date: "2026-10-21", result: "positive", source: "Oct 21, a test, positive", notes: "" } as never]);
  const test = (useJournal.getState().journal.pregnancyTests ?? []).at(-1);
  check("S3 addPregnancyTests stamps through stampNow", (test?.createdAt ?? 0) > BIG, `createdAt=${test?.createdAt}`);
  st.saveQuietMark({ from: "2026-10-22", to: "2026-10-23", reason: "travel", source: "manual" } as never);
  const mark = (useJournal.getState().journal.quietDays ?? []).at(-1);
  check("S3 saveQuietMark stamps through stampNow", (mark?.updatedAt ?? 0) > BIG, `updatedAt=${mark?.updatedAt}`);
  // S5: an edit keeps the mark's birth stamp.
  const born = mark?.createdAt ?? 0;
  st.saveQuietMark({ id: mark?.id, from: "2026-10-22", to: "2026-10-24", reason: "travel", source: "manual" } as never);
  const edited = (useJournal.getState().journal.quietDays ?? []).find((m) => m.id === mark?.id);
  check("S5 a quiet edit preserves createdAt", edited?.createdAt === born && (edited?.updatedAt ?? 0) > born, `createdAt=${edited?.createdAt} born=${born}`);
}

console.log(`WAVE17-ERASURE-STAMPS: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
