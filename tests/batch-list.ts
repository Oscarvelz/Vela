// Numbered lists in the batch reader: every item is its own encounter, and nothing else is read as a list.
import { parseBatch } from "../src/lib/vela/batch";
const now = new Date("2026-11-02T12:00:00");
let pass = 0, fail = 0;
const check = (name: string, text: string, want: number, places?: string[]) => {
  const got = parseBatch(text, now);
  const ok = got.length === want && (!places || places.every((p, i) => got[i]?.place === p));
  if (ok) pass += 1; else { fail += 1; console.log("FAIL", name, got.length, got.map((e) => e.place)); }
};
check("lines 1. 2. 3.", "1. Oct 28 bedroom\n2. Oct 29 couch\n3. shower", 3, ["Bedroom", "Living room", "Shower"]);
check("same date, numbered", "1. Oct 28 bedroom\n2. Oct 28 car", 2);
check("no dates, numbered", "1. bedroom\n2. couch\n3. car\n4. shower", 4);
check("inline 1) 2)", "1) bedroom 2) couch 3) shower", 3);
check("inline 1. 2. es", "Esta semana: 1. en la cama 2. en el sofá", 2);
check("(1) (2)", "(1) bed (2) couch", 2);
check("#1 #2", "#1 bed\n#2 couch", 2);
check("1- 2-", "1- bed\n2- couch", 2);
check("unnumbered continuation stays", "1. bedroom\nwas amazing\n2. car", 2);
check("heading line joins item 1", "Last week:\n1. Monday bed\n2. Wednesday car", 2);
check("rating then number is not a list", "Oct 28 bedroom, rated it 4. 2 rounds total", 1);
check("clock time is not a list", "Oct 30 at 10:30 pm, 45 min, 8/10", 1);
check("lone 1. mid-sentence is not a list", "Oct 28 we did it 1. time only", 1);
check("3-4 times is not a list", "3-4 times on Oct 28", 1);
// The numbers are the author's exact count: a headed round inside an item — inline or on its
// own line — is the item's own round, never a new encounter (Oscar, Nov 9 2026: 37 items read as 39).
check("numbered item, inline headed round stays one", "1. Oct 26 hotel, twice. 2nd time. She was on top.\n2. Oct 27 car", 2);
check("numbered item, own-line headed round stays one", "1. Oct 26 hotel, twice.\n2nd time. She was on top.\n2. Oct 27 car", 2);
check("numbered item, own-line segunda vez stays one", "1. 26 oct hotel, dos veces.\nSegunda vez. Ella arriba.\n2. 27 oct carro", 2);
check("unnumbered headed round still splits", "Oct 26 hotel, twice.\n2nd time. She was on top.", 2);
// A number right after a month name is a date, not the next marker: item 14 saying "March 15."
// must not give birth to item 15 out of its own date (Oscar, Nov 9 2026: the phantom "July" card).
check("month-day inside an item is not a marker", "14. March 15. Twice at the lake.\n15. March 20 at the cabin", 2);
check("month-day inline, the real marker still cuts", "14. March 15. Twice at the lake. 15. March 20 at the cabin", 2);
console.log(`batch-list: ${pass}/${pass + fail}`);
if (fail) process.exit(1);
