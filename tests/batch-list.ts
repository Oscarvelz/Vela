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
console.log(`batch-list: ${pass}/${pass + fail}`);
if (fail) process.exit(1);
