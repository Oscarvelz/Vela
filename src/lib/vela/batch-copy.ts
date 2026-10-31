/* Copy for the natural-language batch log (en / es). Kept apart from copy.ts. */
import { useCallback } from "react";
import { useJournal } from "./store";

const BATCH = {
  en: {
    hint: "Write it the way you'd tell it — one encounter or several. Vela reads dates (“last night”, “Saturday”, “Oct 28 around 11pm”), how many rounds, places, positions, protection, problems and how it felt, and selects the matching bubbles, your own from Settings included. Check each card before saving.",
    placeholder: "Last night with Ana in the bedroom, around 11pm. No condom, she's on the pill. Missionary, then she got on top. Felt so connected — 9/10.\n\nSaturday afternoon at the hotel, twice, condom. It hurt a little at first, then amazing.",
    found: "Read from your words",
    entryN: "Encounter",
    assumedDate: "No date in the text — today for now",
    assumedTime: "no time given",
    rounds: "rounds",
    round: "round",
    nothingFound: "Nothing to select here — it all stays in the note.",
    note: "Kept in the note",
    noteEmpty: "Everything was turned into bubbles.",
    adjust: "Adjust",
    done: "Done",
    skip: "Leave this one out",
    include: "Include it again",
    skipped: "Left out — it won't be saved.",
    partnerFromText: "from the text",
    partnerFallback: "batch partner",
    noPartner: "no partner yet",
    duration: "Duration",
    notStated: "Not stated",
    nextDay: "Ends the next day",
    rounds2: "Rounds",
    saveN: "Save {n}",
    sessionsWord: "sessions",
    sessionWord: "session",
    resetEdits: "Your fixes stay on each card. If you change that encounter's text above, the card is read again.",
    pickPartner: "Who was this with?",
  },
  es: {
    hint: "Escríbelo como lo contarías: un encuentro o varios. Vela lee fechas («anoche», «el sábado», «28 oct como a las 11»), cuántas rondas, lugares, posiciones, protección, problemas y cómo se sintió, y marca las burbujas que coinciden, también las tuyas de Ajustes. Revisa cada tarjeta antes de guardar.",
    placeholder: "Anoche con Ana en el cuarto, como a las 11. Sin condón, ella toma la pastilla. Misionero y luego ella arriba. Nos sentimos muy conectados, un 9/10.\n\nEl sábado en la tarde en el hotel, dos veces, con condón. Al principio dolió un poco, después increíble.",
    found: "Leído de tus palabras",
    entryN: "Encuentro",
    assumedDate: "El texto no trae fecha: por ahora, hoy",
    assumedTime: "sin hora",
    rounds: "rondas",
    round: "ronda",
    nothingFound: "Nada que marcar aquí: todo queda en la nota.",
    note: "Queda en la nota",
    noteEmpty: "Todo se convirtió en burbujas.",
    adjust: "Ajustar",
    done: "Listo",
    skip: "Dejar fuera este",
    include: "Incluirlo otra vez",
    skipped: "Fuera: no se guardará.",
    partnerFromText: "del texto",
    partnerFallback: "pareja del lote",
    noPartner: "aún sin pareja",
    duration: "Duración",
    notStated: "Sin indicar",
    nextDay: "Termina al día siguiente",
    rounds2: "Rondas",
    saveN: "Guardar {n}",
    sessionsWord: "sesiones",
    sessionWord: "sesión",
    resetEdits: "Tus ajustes se quedan en cada tarjeta. Si cambias el texto de ese encuentro, la tarjeta se vuelve a leer.",
    pickPartner: "¿Con quién fue?",
  },
} as const;

export type BatchKey = keyof typeof BATCH.en;

export function useBatchT() {
  const lang = useJournal((s) => s.journal.settings.language);
  return useCallback((key: BatchKey) => (BATCH[lang as "en" | "es"] ?? BATCH.en)[key], [lang]);
}
