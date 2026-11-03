// AUDIT (fake data only): withStart 14-day merge edge cases, undo symmetry, short-cycle handling.
import { cleanCycle, withStart, withoutStart, withEnd, cycleStats, cycleSnapshot, pastCycles, type CycleSettings } from "../src/lib/vela/cycle";
import { trackerForPartner, sessionPhase } from "../src/lib/vela/cycle-trackers";
const base = (starts: string[], ends: Record<string, string> = {}): CycleSettings => cleanCycle({ enabled: true, perspective: "self", starts, ends });
const show = (c: CycleSettings) => `starts=${c.starts.join(",")} ends=${JSON.stringify(c.ends)}`;
let n = 0;
const row = (name: string, verdict: string, c: CycleSettings) => console.log(`${++n}. ${name}\n   → ${show(c)}\n   ${verdict}`);
// 1 genuine distinct bleed with logged end, new start 12 days later
let c = withStart(base(["2026-09-01", "2026-09-29", "2026-10-10"], { "2026-10-10": "2026-10-14" }), "2026-10-22");
row("logged period Oct10–14 (closed), new start Oct 22 (12 days later)", c.starts.includes("2026-10-10") ? "kept" : "SILENTLY REPLACED: Oct 10 start + its logged end are deleted", c);
// 2 undo after merge
const before = base(["2026-10-01", "2026-10-25"], { "2026-10-25": "2026-10-29" });
const merged = withStart(before, "2026-11-02");
const undone = withoutStart(merged, "2026-11-02");
row("Undo (card) after 'Period started today' merged Oct 25 start", JSON.stringify(undone.starts) === JSON.stringify(before.starts) ? "undo restored" : "UNDO DOES NOT RESTORE the replaced Oct 25 start/end", undone);
// 3 backfill an earlier start 10 days before existing
c = withStart(base(["2026-10-20"]), "2026-10-10");
row("backfill Oct 10 when Oct 20 exists", c.starts.includes("2026-10-20") ? "kept both" : "later start Oct 20 removed (moved back)", c);
// 4 two near starts both removed
c = withStart(base(["2026-10-05", "2026-10-15"]), "2026-10-10");
row("Oct 10 between Oct 5 and Oct 15 (both within 14)", c.starts.length === 1 ? "BOTH neighbours removed by one tap" : "ok", c);
// 5 gap exactly 14 days: kept but ignored in stats
c = withStart(base(["2026-09-01", "2026-09-29", "2026-10-27"]), "2026-11-10");
const st = cycleStats(c);
row("start 14 days after last (not merged)", `kept; stats gaps=${JSON.stringify(st.gaps)} (14-day gap ignored: gapsOf needs ≥15) pastCycles=${JSON.stringify(pastCycles(c).map(p=>p.length))}`, c);
// 6 carry: new start before old end
c = withStart(base(["2026-10-10"], { "2026-10-10": "2026-10-15" }), "2026-10-08");
row("earlier start Oct 8 with old Oct10–15", "end carried? " + (c.ends["2026-10-08"] ?? "none"), c);
// 7 day logs of replaced period
c = withStart(cleanCycle({ enabled: true, starts: ["2026-10-10"], ends: { "2026-10-10": "2026-10-14" }, days: { "2026-10-11": { flow: "heavy" } } }), "2026-10-20");
row("replaced period's day logs", "days kept: " + JSON.stringify(c.days) + " (flow logged on a day no longer in any period)", c);
// 8 snapshot late detection
const sn = cycleSnapshot(base(["2026-08-01", "2026-08-29", "2026-09-26"]), "2026-11-02");
console.log(`${++n}. late detection, last start Sep 26, cycle 28 → snapshot late=${(sn as any).late} due=${(sn as any).due} phase=${sn.phase} day=${sn.day}`);
// 9 assignment rule
const T = (id: string, perspective: "self" | "partner", partnerLink = "", enabled = true) => ({ ...base(["2026-10-01"]), id, perspective, partnerLink, partnerName: "", enabled, updatedAt: 0, metaAt: 0, stamps: {} } as any);
const ts = [T("a", "partner", "Fakeana"), T("b", "partner", "Fakelu"), T("s", "self")];
console.log(`${++n}. assignment: Fakeana→${trackerForPartner(ts, "Fakeana")?.id} Fakelu→${trackerForPartner(ts, "Fakelu")?.id} Fakemar→${trackerForPartner(ts, "Fakemar")?.id} solo→${trackerForPartner(ts, "")?.id} fakeana(lower)→${trackerForPartner(ts, "fakeana")?.id}`);
const ts2 = [T("a", "partner", "Fakeana"), T("b", "partner", "Fakelu")];
console.log(`   no self: Fakemar→${trackerForPartner(ts2, "Fakemar")?.id ?? "none"} solo→${trackerForPartner(ts2, "")?.id ?? "none"}`);
const ts3 = [T("a", "partner", "Fakeana")];
console.log(`   only Fakeana tracker: Fakemar→${trackerForPartner(ts3, "Fakemar")?.id ?? "none"} (rule 3: sole tracker colours another partner's sessions)`);
