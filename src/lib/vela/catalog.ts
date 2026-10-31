import type { Lang } from "./copy";

export const PLACES = [
  "Bedroom",
  "Living room",
  "Shower",
  "Car",
  "Hotel",
  "Outdoors",
  "Office",
  "Other",
] as const;

export const POSITIONS = [
  "Missionary",
  "Doggy",
  "Cowgirl",
  "Reverse Cowgirl",
  "Spooning",
  "Standing",
  "Oral",
  "69",
  "Lotus",
  "Other",
] as const;

export const PROBLEMS = [
  ["erection", "problemErection"],
  ["climax", "problemClimax"],
  ["timing", "problemTiming"],
  ["pain", "problemPain"],
  ["dryness", "problemDryness"],
  ["fatigue", "problemFatigue"],
  ["connection", "problemConnection"],
  ["mood", "problemMood"],
  ["stress", "problemStress"],
  ["distraction", "problemDistraction"],
  ["privacy", "problemPrivacy"],
  ["desire", "problemDesire"],
  ["period", "problemPeriod"],
  ["anxiety", "problemAnxiety"],
  ["alcohol", "problemAlcohol"],
  ["medication", "problemMedication"],
  ["interruption", "problemInterruption"],
  ["bleeding", "problemBleeding"],
  ["irritation", "problemIrritation"],
] as const;

export function knownProblem(id: string) {
  return PROBLEMS.find((item) => item[0] === id)?.[1] ?? null;
}

const PLACE_ES: Record<string, string> = {
  Bedroom: "Dormitorio",
  "Living room": "Sala de estar",
  Shower: "Ducha",
  Car: "Coche",
  Hotel: "Hotel",
  Outdoors: "Al aire libre",
  Office: "Oficina",
  Other: "Otro",
  "Mi Tierra": "Mi Tierra",
  Trailer: "Tráiler",
};

const POSITION_ES: Record<string, string> = {
  Missionary: "Misionero",
  Doggy: "Perrito",
  Cowgirl: "Vaquera",
  "Reverse Cowgirl": "Vaquera invertida",
  Spooning: "Cucharita",
  Standing: "De pie",
  Oral: "Oral",
  "69": "69",
  Lotus: "Flor de loto",
  Other: "Otra",
};

export const NAMED_PLACES = [
  { name: "Mi Tierra", re: /\bmi\s+tierra\b/i },
  { name: "Trailer", re: /\btr[aá]il(?:eres|ers?|es?)\b/i },
] as const;

export function namedPlace(text: string) {
  let found: { name: string; index: number } | null = null;
  for (const place of NAMED_PLACES) {
    const match = place.re.exec(text);
    if (!match) continue;
    const index = match.index ?? 0;
    if (!found || index < found.index) found = { name: place.name, index };
  }
  return found?.name ?? "";
}

export function placeLabel(lang: Lang, value: string) {
  return (lang === "es" && PLACE_ES[value]) || value;
}

export function positionLabel(lang: Lang, value: string) {
  return (lang === "es" && POSITION_ES[value]) || value;
}

export const THEMES = [
  { id: "firmament", name: "themeFirmamentName", desc: "themeFirmamentDesc" },
  { id: "velvet", name: "themeVelvetName", desc: "themeVelvetDesc" },
  { id: "noir", name: "themeNoirName", desc: "themeNoirDesc" },
  { id: "rose", name: "themeRoseName", desc: "themeRoseDesc" },
  { id: "ocean", name: "themeOceanName", desc: "themeOceanDesc" },
  { id: "emerald", name: "themeEmeraldName", desc: "themeEmeraldDesc" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type RatingStyle = "flame" | "star" | "heart";
export type WeekStart = "monday" | "sunday";
export type Mode = "night" | "day";
