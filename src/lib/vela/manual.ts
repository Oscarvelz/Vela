/* Vela's user manual — the single source of truth for every (?) bubble and
 * every manual entry (the fleet pattern, as in Faro and Brizna).
 *
 * The law (Oscar's LEY DE MANUALES): the manual explains ONLY what is not
 * visible — invisible behavior, consequences, what each verb really does.
 * The (?) bubble (`what`) is short and to the point, a SEPARATE text from
 * the manual entry, and it is never shown inside the manual; every bubble
 * closes with «Más en el manual →» landing on its exact topic. Examples are
 * short and meaningful, with round lesson-grade numbers. Control names
 * written as [[Name]] inside a text become dotted links that jump to the
 * living control. When a wave changes a behavior, these words change in
 * the same wave — no obsolescence.
 *
 * Language pairs are [english, español] — Vela's own order in copy.ts.
 */
import type { TabId } from "./types";

export type L = readonly [string, string]; // [english, español]
export function pick(lang: string, pair: L): string {
  return lang === "es" ? pair[1] : pair[0];
}

export type Go = {
  tab?: TabId;
  settings?: string; // a Settings accordion id to open
  cycleSheet?: boolean;
  spot?: string; // a data-spot token on the living control
  where: L; // where it is, said plainly
};

export type Topic = {
  id: string;
  title: L;
  sum: L; // one line: the big idea, read first
  what: L; // the (?) bubble ONLY — never rendered in the manual
  whatAlt?: L; // second bubble text when the same (?) changes with state
  how: L; // step by step, one step per line ("\n")
  calc?: L; // how the numbers are made
  example: L; // a concrete case with round numbers (required)
  cases?: L; // "If this happens…": one case per line, "Situation: outcome"
  mistake?: L; // the common mistake
  related?: string[];
  go?: Go;
  terms?: L[]; // extra words for search and the A–Z index
};

export type Chapter = { id: string; title: L; intro: L; topics: Topic[] };

/** A (?) whose subject has nothing more to say gets no page of its own:
 *  its bubble keeps its own sentence, and «Más en el manual» opens the
 *  richer topic named in `into`. */
export type HintOnly = { id: string; what: L; whatAlt?: L; into: string };

export const MANUAL_CHAPTERS: Chapter[] = [
  {
    id: "empezar",
    title: ["Getting started", "Empezar"],
    intro: [
      "What Vela is, what guards it, and how the door works — including without a connection.",
      "Qué es Vela, qué la guarda y cómo funciona la puerta — también sin conexión.",
    ],
    topics: [
      {
        id: "tu-frase",
        title: ["Your passphrase is the only key", "Tu frase es la única llave"],
        sum: [
          "Vela encrypts the whole diary with your passphrase. There is no copy of it anywhere else.",
          "Vela cifra todo el diario con tu frase. No existe una copia en ningún otro sitio.",
        ],
        what: [
          "Your passphrase opens this diary and nothing else can. If you forget it, the diary cannot be opened — not by us, not by anyone.",
          "Tu frase abre este diario y nada más puede abrirlo. Si la olvidas, el diario no se puede abrir: ni nosotros ni nadie.",
        ],
        how: [
          "The passphrase never travels as text: this device derives the encryption key from it, here.\nSigning in on another device asks for the same passphrase, because the cloud only ever holds the sealed diary.\nChanging the passphrase in [[Settings]] re-seals the diary with the new key.",
          "La frase nunca viaja como texto: este dispositivo deriva la llave de cifrado de ella, aquí.\nEntrar en otro dispositivo pide la misma frase, porque la nube solo guarda el diario sellado.\nCambiar la frase en [[Ajustes]] vuelve a sellar el diario con la llave nueva.",
        ],
        example: [
          "It is the only key to a house with no locksmith: a ‘forgot my password’ link cannot exist here, because nobody holds a spare.",
          "Es la única llave de una casa sin cerrajero: aquí no puede existir un enlace de «olvidé mi contraseña», porque nadie guarda una copia.",
        ],
        mistake: [
          "Using the same short word you use everywhere. The diary is worth a long, private phrase.",
          "Usar la misma palabra corta que usas en todas partes. El diario merece una frase larga y privada.",
        ],
        cases: [
          "You change phones: the new device asks for the passphrase before anything else — without it, the sealed diary stays sealed.",
          "Cambias de teléfono: el dispositivo nuevo pide la frase antes que nada — sin ella, el diario sellado permanece sellado.",
        ],
        related: ["bloqueo", "copias"],
        go: { settings: "privacy", spot: "change-passphrase", where: ["Settings → Privacy & data → Privacy", "Ajustes → Privacidad y datos → Privacidad"] },
        terms: [["password", "contraseña"], ["encryption", "cifrado"]],
      },
      {
        id: "puerta-sin-conexion",
        title: ["Signing in without a connection", "Entrar sin conexión"],
        sum: [
          "Once this device knows you, the door opens offline. Your work saves here and syncs when the connection returns.",
          "Una vez que este dispositivo te conoce, la puerta abre sin conexión. Tu trabajo se guarda aquí y se sincroniza cuando vuelve la conexión.",
        ],
        what: [
          "No signal? Vela still opens on a device that has signed in before, and everything you write is saved on the device until you're back online.",
          "¿Sin señal? Vela abre igual en un dispositivo que ya entró antes, y todo lo que escribes se guarda en el dispositivo hasta que vuelvas a tener conexión.",
        ],
        how: [
          "After your first sign-in, the device keeps an encrypted key of its own, so the passphrase check works with no network at all.\nEverything written offline saves into the diary on this device first.\nSigning out on purpose is different: it forgets the device, and the next sign-in needs the connection and the passphrase.",
          "Tras tu primer ingreso, el dispositivo guarda una llave cifrada propia, así que la comprobación de la frase funciona sin red.\nTodo lo escrito sin conexión se guarda primero en el diario de este dispositivo.\nCerrar sesión a propósito es distinto: olvida el dispositivo, y el próximo ingreso necesita la conexión y la frase.",
        ],
        example: [
          "On a plane you open Vela, log the weekend, and close it. At home, on Wi-Fi, those entries are already in the cloud copy.",
          "En un avión abres Vela, registras el fin de semana y la cierras. En casa, con Wi-Fi, esas entradas ya están en la copia de la nube.",
        ],
        cases: [
          "First time on a new phone, without signal: the door can't open — this device doesn't know you yet.",
          "Primera vez en un teléfono nuevo, sin señal: la puerta no puede abrir — este dispositivo aún no te conoce.",
        ],
        mistake: [
          "Signing out to ‘test’ the offline door. Signing out forgets the device on purpose — that is the one exit that needs the network to come back.",
          "Cerrar sesión para «probar» la puerta sin conexión. Cerrar sesión olvida el dispositivo a propósito: es la única salida que necesita la red para volver.",
        ],
        related: ["sincronizacion"],
        go: { settings: "data", spot: "account-door", where: ["Settings → Privacy & data → Data & sync", "Ajustes → Privacidad y datos → Datos y sincronización"] },
        terms: [["offline", "sin conexión"], ["airplane mode", "modo avión"]],
      },
      {
        id: "bloqueo",
        title: ["The lock and your fingerprint", "El bloqueo y tu huella"],
        sum: [
          "Vela locks itself when you leave. Your fingerprint is a shortcut on this device — never a replacement for the passphrase.",
          "Vela se bloquea cuando te vas. Tu huella es un atajo en este dispositivo — nunca un reemplazo de la frase.",
        ],
        what: [
          "The fingerprint only unlocks this device, quickly. It proves nothing to the cloud, and anyone who knows the passphrase still opens the diary.",
          "La huella solo desbloquea este dispositivo, rápido. No prueba nada ante la nube, y quien sepa la frase seguirá abriendo el diario.",
        ],
        how: [
          "In [[Settings]] → Privacy you choose how soon Vela asks again: at once, after a while, or only when you tap Lock now.\nIf the fingerprint ever fails, the passphrase always works — the lock falls back to it.\nThe lock is per device: your phone and your tablet each keep their own.",
          "En [[Ajustes]] → Privacidad eliges cuánto tarda Vela en volver a pedir: enseguida, después de un rato, o solo cuando tocas Bloquear ahora.\nSi la huella falla alguna vez, la frase siempre funciona: el bloqueo vuelve a ella.\nEl bloqueo es por dispositivo: tu teléfono y tu tableta guardan cada uno el suyo.",
        ],
        example: [
          "Someone knows your phone's fingerprint but not your passphrase: Vela stays shut, because the fingerprint is tied to this device's key only.",
          "Alguien conoce la huella de tu teléfono pero no tu frase: Vela permanece cerrada, porque la huella está atada solo a la llave de este dispositivo.",
        ],
        mistake: [
          "Thinking the fingerprint protects the cloud copy. It doesn't travel: on a new phone, only the passphrase opens Vela.",
          "Creer que la huella protege la copia de la nube. No viaja: en un teléfono nuevo, solo la frase abre Vela.",
        ],
        cases: [
          "The phone updates and the fingerprint stops matching: the passphrase opens Vela as always — nothing is lost, and the fingerprint can be set up again.",
          "El teléfono se actualiza y la huella deja de coincidir: la frase abre Vela como siempre — nada se pierde, y la huella puede configurarse otra vez.",
        ],
        related: ["tu-frase"],
        go: { settings: "privacy", spot: "lock-now", where: ["Settings → Privacy & data → Privacy", "Ajustes → Privacidad y datos → Privacidad"] },
        terms: [["biometric", "biometría"], ["auto-lock", "bloqueo automático"]],
      },
      {
        id: "el-manual",
        title: ["This manual and the (?) bubbles", "Este manual y las burbujas (?)"],
        sum: [
          "Every (?) in the app opens a short bubble; its footer opens this manual at the exact topic. Names with a dotted underline jump to the living control.",
          "Cada (?) de la app abre una burbuja corta; su pie abre este manual en el tema exacto. Los nombres con subrayado punteado saltan al control vivo.",
        ],
        what: [
          "The bubble answers in one or two sentences. This manual is the deep version — what a thing does, what happens after, and the mistake to avoid.",
          "La burbuja responde en una o dos frases. Este manual es la versión profunda: qué hace una cosa, qué pasa después, y el error a evitar.",
        ],
        how: [
          "Tap any (?) and read the short answer; tap ‘More in the manual’ to land here, on that topic.\nInside the manual, some names wear a dotted underline: those are doors — tapping one takes you to that place in the app and lights it.\nEach entry also carries its own ‘See it in the app’ button, with the place said in plain words.",
          "Toca cualquier (?) y lee la respuesta corta; toca «Más en el manual» para aterrizar aquí, en ese tema.\nDentro del manual, algunos nombres llevan un subrayado punteado: son puertas — tocar uno te lleva a ese lugar de la app y lo ilumina.\nCada entrada lleva además su propio botón «Ver en la app», con el lugar dicho en palabras llanas.",
        ],
        example: [
          "Reading about quiet days, you tap [[Calendar]] and Vela takes you there and lights the day panel — the manual closes behind you, and Back returns to the entry.",
          "Leyendo sobre los días quietos, tocas [[Calendario]] y Vela te lleva allí e ilumina el panel del día: el manual se cierra detrás de ti, y Atrás vuelve a la entrada.",
        ],
        cases: [
          "You arrive from a (?) bubble: the manual opens on that exact entry, lit — you never land on a cover and hunt.\nYou open it from Settings instead: it opens at the cover, with every chapter and the A–Z index.",
          "Llegas desde una burbuja (?): el manual abre en esa entrada exacta, iluminada — nunca aterrizas en una portada a cazar.\nLo abres desde Ajustes: abre en la portada, con cada capítulo y el índice A–Z.",
        ],
        related: ["lector-lotes", "dias-quietos"],
        go: { settings: "manual", where: ["Settings → Manual", "Ajustes → Manual"] },
        terms: [["help", "ayuda"], ["guide", "guía"]],
      },
    ],
  },
  {
    id: "registrar",
    title: ["Logging", "Registrar"],
    intro: [
      "How a moment gets written — by hand, in rounds, or read from your own words in a batch.",
      "Cómo se escribe un momento: a mano, en rondas, o leído de tus propias palabras en un lote.",
    ],
    topics: [
      {
        id: "registrar",
        title: ["Logging a moment", "Registrar un momento"],
        sum: [
          "One form, one moment. What you rate becomes the note; what you write stays yours, word for word.",
          "Un formulario, un momento. Lo que calificas se vuelve la nota; lo que escribes queda tuyo, palabra por palabra.",
        ],
        what: [
          "The stars and hearts aren't decoration: when you save, they compose the note you see in History. Your own words are added untouched.",
          "Las estrellas y los corazones no son decoración: al guardar, componen la nota que ves en el Historial. Tus propias palabras se añaden intactas.",
        ],
        how: [
          "Fill what you remember — nothing is required except who it was with.\nEach dial you set writes one plain sentence into the note.\nSaving puts the moment in [[History]] and in every statistic that reads it.",
          "Completa lo que recuerdes: nada es obligatorio salvo con quién fue.\nCada medidor que ajustas escribe una frase sencilla en la nota.\nAl guardar, el momento entra en el [[Historial]] y en cada estadística que lo lee.",
        ],
        example: [
          "Five hearts on satisfaction and four on connection save a note that says, in words, that it was deeply satisfying and you felt close — the dials become sentences.",
          "Cinco corazones en satisfacción y cuatro en conexión guardan una nota que dice, en palabras, que fue profundamente satisfactorio y que se sintieron cerca: los medidores se vuelven frases.",
        ],
        cases: [
          "A moment with no dials set: it saves with its facts only, and counts as unrated everywhere.",
          "Un momento sin medidores: se guarda solo con sus hechos, y cuenta como no calificado en todas partes.",
        ],
        mistake: [
          "Editing the composed note to fix a rating. The note is the dials in words — change the dial on the moment instead, and the note follows.",
          "Editar la nota compuesta para corregir una calificación. La nota son los medidores en palabras: cambia el medidor en el momento, y la nota lo sigue.",
        ],
        related: ["rondas", "lector-lotes"],
        go: { tab: "home", spot: "log-form", where: ["Home, the log form", "Inicio, el formulario de registro"] },
        terms: [["ratings", "calificaciones"], ["note", "nota"]],
      },
      {
        id: "rondas",
        title: ["Rounds and encounters", "Rondas y encuentros"],
        sum: [
          "An encounter can hold several rounds. A round shares the moment's facts — never a second voice.",
          "Un encuentro puede tener varias rondas. Una ronda comparte los hechos del momento — nunca una segunda voz.",
        ],
        what: [
          "+1 adds another round of the same encounter: same day, same facts. If it was a different moment, log it as its own entry instead.",
          "+1 añade otra ronda del mismo encuentro: mismo día, mismos hechos. Si fue un momento distinto, regístralo como su propia entrada.",
        ],
        how: [
          "Tap +1 on a card when the same encounter happened again.\nThe round copies the date, place and facts — and leaves any second voice behind, on purpose: she rates her own moments.\nRounds stay inside their encounter's day; they never move a date.",
          "Toca +1 en una tarjeta cuando el mismo encuentro se repitió.\nLa ronda copia la fecha, el lugar y los hechos — y deja atrás cualquier segunda voz, a propósito: ella califica sus propios momentos.\nLas rondas viven dentro del día de su encuentro; nunca mueven una fecha.",
        ],
        example: [
          "One night, twice: that's one encounter with two rounds, and Statistics counts two sessions on one date.",
          "Una noche, dos veces: es un encuentro con dos rondas, y Estadísticas cuenta dos sesiones en una sola fecha.",
        ],
        mistake: [
          "Using +1 for a new day. Rounds belong to their encounter's day; a new day is a new entry.",
          "Usar +1 para un día nuevo. Las rondas pertenecen al día de su encuentro; un día nuevo es una entrada nueva.",
        ],
        cases: [
          "The second round was different — another place, another feeling: log it as its own moment instead; rounds are for the same encounter, repeated.",
          "La segunda ronda fue distinta — otro lugar, otra sensación: regístrala como su propio momento; las rondas son para el mismo encuentro, repetido.",
        ],
        related: ["registrar", "su-voz"],
        go: { tab: "history", spot: "round-add", where: ["History, on a moment's card", "Historial, en la tarjeta de un momento"] },
        terms: [["twice", "dos veces"], ["session", "sesión"]],
      },
      {
        id: "lector-lotes",
        title: ["The batch reader", "El lector de lotes"],
        sum: [
          "Paste a stretch of your journal as plain text and Vela reads it into entries — dates, rounds, places, feelings — before you confirm anything.",
          "Pega un tramo de tu diario como texto sencillo y Vela lo lee en entradas — fechas, rondas, lugares, sensaciones — antes de que confirmes nada.",
        ],
        what: [
          "The reader turns your words into entry cards you can adjust before saving. Nothing is saved until you tap Save.",
          "El lector convierte tus palabras en tarjetas de entrada que puedes ajustar antes de guardar. Nada se guarda hasta que tocas Guardar.",
        ],
        how: [
          "Write one encounter per line or paragraph, with its date; the year carries on from line to line.\n‘Once’, ‘twice’, ‘the next day’ — the reader understands the plain words for rounds and moving days.\nCheck the cards it made, fix any field, then save them all at once from [[Log a batch]].",
          "Escribe un encuentro por línea o párrafo, con su fecha; el año continúa de línea en línea.\n«Una vez», «dos veces», «al día siguiente»: el lector entiende las palabras sencillas para las rondas y los días que se mueven.\nRevisa las tarjetas que hizo, corrige cualquier campo y guarda todo de una vez desde [[Registrar un lote]].",
        ],
        example: [
          "‘Oct 12. With Ana at home, twice, Lotus.’ becomes one entry — Ana, October 12, two rounds, that position — before you ever tap Save.",
          "«12 de oct. Con Ana en casa, dos veces, Lotus.» se vuelve una entrada — Ana, 12 de octubre, dos rondas, esa posición — antes de que toques Guardar.",
        ],
        cases: [
          "A line with no date: it joins the last date the reader saw.\nA name it doesn't know: the card asks who it was with before it can save.\nA line it cannot read at all: it stays out of the cards, and the reader says so — your text is never silently dropped.",
          "Una línea sin fecha: se une a la última fecha que el lector vio.\nUn nombre que no conoce: la tarjeta pregunta con quién fue antes de poder guardar.\nUna línea que no puede leer en absoluto: queda fuera de las tarjetas, y el lector lo dice — tu texto nunca se descarta en silencio.",
        ],
        related: ["propuestas-lector", "registrar"],
        go: { tab: "home", spot: "batch-card", where: ["Home → Log a batch", "Inicio → Registrar un lote"] },
        terms: [["paste", "pegar"], ["import text", "importar texto"]],
      },
      {
        id: "propuestas-lector",
        title: ["What the reader proposes", "Lo que el lector propone"],
        sum: [
          "Sometimes the reader hears more than entries: a stretch explained, or a pregnancy stated. It proposes — with your exact words as evidence — and writes nothing until you keep it.",
          "A veces el lector escucha más que entradas: un tramo explicado, o un embarazo dicho. Propone — con tus palabras exactas como evidencia — y no escribe nada hasta que lo conservas.",
        ],
        what: [
          "When your words name something bigger — weeks of work with no time, a pregnancy test, ‘I'm pregnant’ — Vela shows a proposal card quoting the exact sentence it heard.",
          "Cuando tus palabras nombran algo mayor — semanas de trabajo sin tiempo, una prueba de embarazo, «estoy embarazada» — Vela muestra una tarjeta de propuesta citando la frase exacta que escuchó.",
        ],
        how: [
          "Proposals appear above the Save button, one card per finding, each quoting your words.\nKeeping a pregnancy notes it on the cycle those words belong to, so the cycle never asks about it later.\nKeeping tests saves them as events [[Statistics]] can count, exactly as you stated them.\nA finding worded less directly — a suspicion, a condition, words assembled from separate clauses — is shown on the card but not saved; if it is right, add it by hand.\n‘Don't record it’ drops the proposal and nothing is written.",
          "Las propuestas aparecen sobre el botón Guardar, una tarjeta por hallazgo, cada una citando tus palabras.\nConservar un embarazo lo anota en el ciclo al que pertenecen esas palabras, así el ciclo nunca preguntará por él.\nConservar las pruebas las guarda como eventos que [[Estadísticas]] puede contar, tal como las dijiste.\nUn hallazgo dicho de forma menos directa — una sospecha, una condición, palabras armadas desde cláusulas separadas — se muestra en la tarjeta pero no se guarda; si es correcto, añádelo a mano.\n«No lo registres» descarta la propuesta y no se escribe nada.",
        ],
        example: [
          "‘She did a pregnancy test, and the two were negative and one was positive’ proposes three tests — one positive — and the pregnancy itself, all from that one sentence.",
          "«Se hizo una prueba de embarazo, y dos salieron negativas y una positiva» propone tres pruebas — una positiva — y el embarazo mismo, todo de esa sola frase.",
        ],
        mistake: [
          "Expecting the reader to hear wishes. ‘We're trying’ or ‘I hope I'm pregnant’ propose nothing: the reader records only what your words state.",
          "Esperar que el lector escuche deseos. «Estamos tratando» o «espero estar embarazada» no proponen nada: el lector registra solo lo que tus palabras afirman.",
        ],
        related: ["lector-lotes", "proyeccion", "pruebas", "dias-quietos"],
        go: { tab: "home", spot: "batch-save", where: ["Home → Log a batch, above Save", "Inicio → Registrar un lote, sobre Guardar"] },
        terms: [["evidence", "evidencia"], ["suggestion", "sugerencia"]],
      },
    ],
  },
  {
    id: "historial",
    title: ["History", "Historial"],
    intro: [
      "Everything written lives here — searchable by its words, revisit-able by its days, and governable person by person.",
      "Todo lo escrito vive aquí: buscable por sus palabras, revisitado por sus días y gobernado persona por persona.",
    ],
    topics: [
      {
        id: "buscar",
        title: ["Searching History", "Buscar en el Historial"],
        sum: [
          "History searches words, not just dates — including the words of a second voice. Phase filters keep only the days that truly were that phase.",
          "El Historial busca palabras, no solo fechas — incluidas las palabras de una segunda voz. Los filtros de fase conservan solo los días que de verdad fueron esa fase.",
        ],
        what: [
          "The search reads notes and both voices' own words. Filtering by a phase keeps only days the cycle record says were in it — nothing is guessed.",
          "La búsqueda lee las notas y las palabras propias de ambas voces. Filtrar por una fase conserva solo los días que el registro del ciclo dice que estuvieron en ella: nada se adivina.",
        ],
        how: [
          "Type any word — a place, a feeling, something she wrote — and [[History]] keeps the moments that carry it.\nTap a phase chip to see only period, fertile or ovulation days, as the cycle recorded them.\nClearing the search returns the whole river, newest first.",
          "Escribe cualquier palabra — un lugar, una sensación, algo que ella escribió — y el [[Historial]] conserva los momentos que la llevan.\nToca una ficha de fase para ver solo los días de periodo, fértiles o de ovulación, tal como el ciclo los registró.\nBorrar la búsqueda devuelve todo el río, lo más nuevo primero.",
        ],
        example: [
          "Searching ‘cabin’ finds every moment at the cabin, even years apart; the ovulation filter then shows which of them fell on an ovulation day.",
          "Buscar «cabaña» encuentra cada momento en la cabaña, incluso con años de distancia; el filtro de ovulación muestra entonces cuáles cayeron en un día de ovulación.",
        ],
        cases: [
          "A word she wrote in her own voice: it finds the moment too — both voices are part of the record the search reads.\nA phase with no recorded days behind it: the filter finds nothing, because a phase is only kept when the cycle record truly places a day in it.",
          "Una palabra que ella escribió con su propia voz: también encuentra el momento — ambas voces son parte del registro que la búsqueda lee.\nUna fase sin días registrados detrás: el filtro no encuentra nada, porque una fase solo se conserva cuando el registro del ciclo de verdad coloca un día en ella.",
        ],
        mistake: [
          "Expecting the search to understand a meaning. It reads words as written — search the word the note actually uses.",
          "Esperar que la búsqueda entienda un significado. Lee las palabras tal como están escritas: busca la palabra que la nota de verdad usa.",
        ],
        related: ["historias", "el-ciclo"],
        go: { tab: "history", spot: "hist-search", where: ["History, the search field", "Historial, el campo de búsqueda"] },
        terms: [["filter", "filtro"], ["find", "encontrar"]],
      },
      {
        id: "historias",
        title: ["Stories: today, back then", "Historias: hoy, hace tiempo"],
        sum: [
          "On Home, Vela brings back what happened on this day a month, a season, a year ago — the date, the person and the glow, never the text.",
          "En Inicio, Vela trae de vuelta lo que pasó este día hace un mes, una estación, un año: la fecha, la persona y el resplandor, nunca el texto.",
        ],
        what: [
          "Stories are doors, not quotes: a card shows when it was and how it shone, and tapping it opens that day in History. A memory can be hidden for good.",
          "Las Historias son puertas, no citas: una tarjeta muestra cuándo fue y cómo brilló, y tocarla abre ese día en el Historial. Un recuerdo puede ocultarse para siempre.",
        ],
        how: [
          "The rail appears only when a past day matches today — it is never padded with anything else.\nOn a card you can mute that single memory, or stop a person from resurfacing in Stories.\n[[Settings]] → Memories brings muted memories and people back.",
          "El carril aparece solo cuando un día pasado coincide con hoy: nunca se rellena con otra cosa.\nEn una tarjeta puedes silenciar ese recuerdo solo, o impedir que una persona resurja en Historias.\n[[Ajustes]] → Recuerdos trae de vuelta los recuerdos y las personas silenciadas.",
        ],
        example: [
          "On March 14, a card reads ‘A year ago — Ana’, because something was logged on March 14 last year, and it shone.",
          "El 14 de marzo, una tarjeta dice «Hace un año — Ana», porque algo se registró el 14 de marzo del año pasado, y brilló.",
        ],
        cases: [
          "A day holding both a story and an anniversary: the celebration leads the rail.\nNothing matches today: there is no rail at all, and Home simply begins with the cycle.",
          "Un día con una historia y un aniversario: la celebración encabeza el carril.\nNada coincide hoy: no hay carril, e Inicio comienza simplemente con el ciclo.",
        ],
        mistake: [
          "Hunting for a story's words on the card. The card is a door by design — the words live in the day it opens, in History.",
          "Cazar las palabras de una historia en la tarjeta. La tarjeta es una puerta por diseño: las palabras viven en el día que abre, en el Historial.",
        ],
        related: ["fechas", "archivar"],
        go: { tab: "home", spot: "stories-rail", where: ["Home, under the greeting", "Inicio, bajo el saludo"] },
        terms: [["memories", "recuerdos"], ["throwback", "recuerdo"]],
      },
      {
        id: "fechas",
        title: ["Dates that must not blur", "Fechas que no se borran"],
        sum: [
          "Anniversaries and your children's birthdays live in History with a living counter — how long it has been, counted honestly — and they warm as they approach.",
          "Los aniversarios y los cumpleaños de tus hijos viven en el Historial con un contador vivo — cuánto ha pasado, contado con honestidad — y se calientan al acercarse.",
        ],
        what: [
          "Add the day you met, a wedding, a birthday. Vela counts the time since, and the Advisor congratulates the time — never the quality of the years.",
          "Añade el día en que se conocieron, una boda, un cumpleaños. Vela cuenta el tiempo desde entonces, y el Asesor felicita el tiempo — nunca la calidad de los años.",
        ],
        how: [
          "A date can carry its year or not; a February 29 date is kept on February 28 in common years.\nMark a date a milestone and its day gets the full ceremony: the bloom and the count-up on [[Home]].\nTapping a date opens History on the day it began.",
          "Una fecha puede llevar su año o no; una fecha del 29 de febrero se guarda el 28 en los años comunes.\nMarca una fecha como hito y su día recibe la ceremonia completa: el resplandor y la cuenta en [[Inicio]].\nTocar una fecha abre el Historial en el día en que comenzó.",
        ],
        example: [
          "Met on June 3, 2019: the card counts six years, and as June 3 nears the date warms into the accent across its final week.",
          "Se conocieron el 3 de junio de 2019: la tarjeta cuenta seis años, y al acercarse el 3 de junio la fecha se calienta hacia el acento en su última semana.",
        ],
        cases: [
          "A date without a year: it still returns every year and warms as it nears — the counter simply has no years to count, and says the day only.\nA child's birthday: the counter counts the child's age, and the day joins the celebrations like any other date here.",
          "Una fecha sin año: vuelve cada año igual y se calienta al acercarse — el contador simplemente no tiene años que contar, y dice solo el día.\nEl cumpleaños de un hijo: el contador cuenta la edad del niño, y el día se une a las celebraciones como cualquier otra fecha aquí.",
        ],
        mistake: [
          "Deleting a date to stop its celebration. Muting belongs to Stories; a date here is the record itself — deleting it removes the count for good.",
          "Eliminar una fecha para detener su celebración. Silenciar pertenece a Historias; una fecha aquí es el registro mismo: eliminarla quita la cuenta para siempre.",
        ],
        related: ["historias", "el-asesor"],
        go: { tab: "history", spot: "anniv-card", where: ["History, under At a glance", "Historial, bajo De un vistazo"] },
        terms: [["anniversary", "aniversario"], ["birthday", "cumpleaños"]],
      },
      {
        id: "archivar",
        title: ["Archiving a person", "Archivar a una persona"],
        sum: [
          "Archiving puts a person's history to rest without erasing it. You decide where she still appears; deleting is a different, final door.",
          "Archivar pone el historial de una persona a descansar sin borrarlo. Tú decides dónde sigue apareciendo; eliminar es otra puerta, la final.",
        ],
        what: [
          "Archived is not deleted. Her moments rest, and you choose — per person — whether they still show in History, count in Statistics, or resurface in Stories.",
          "Archivado no es eliminado. Sus momentos descansan, y tú eliges — por persona — si siguen viéndose en el Historial, contando en Estadísticas o resurgiendo en Historias.",
        ],
        how: [
          "Partners → Archive rests a person with all three switches off until you choose otherwise.\nThe three switches live in [[Settings]] → Archive: in History, in Statistics, in Stories — each is yours to set.\nRestoring brings the person back whole, exactly as she rested.\nDeleting instead asks you to type her full name — and then her moments, her cycles and her dates are removed, with no way back.",
          "Parejas → Archivar pone a una persona a descansar con los tres interruptores apagados hasta que decidas otra cosa.\nLos tres interruptores viven en [[Ajustes]] → Archivo: en el Historial, en Estadísticas, en Historias — cada uno es tuyo.\nRestaurar devuelve a la persona entera, tal como descansó.\nEliminar, en cambio, pide escribir su nombre completo — y entonces sus momentos, sus ciclos y sus fechas se quitan, sin vuelta atrás.",
        ],
        example: [
          "An old relationship: archive her with all three switches off and the diary goes quiet about her — but nothing is lost if you ever restore her.",
          "Una relación antigua: archívala con los tres interruptores apagados y el diario se queda en silencio sobre ella — pero nada se pierde si un día la restauras.",
        ],
        mistake: [
          "Archiving to hide something inside a shared diary. In couple mode there are no private corners; archiving is about rest, not secrecy.",
          "Archivar para esconder algo dentro de un diario compartido. En modo pareja no hay rincones privados; archivar es descanso, no secreto.",
        ],
        related: ["activar-pareja", "borrar-todo"],
        go: { settings: "archive", spot: "archive-section", where: ["Settings → People & places → Archive", "Ajustes → Personas y lugares → Archivo"] },
        terms: [["delete a person", "eliminar a una persona"], ["restore", "restaurar"]],
      },
    ],
  },
  {
    id: "ciclos",
    title: ["Cycles", "Ciclos"],
    intro: [
      "One cycle per person, read from her own dates — its phases, its questions, its projections, and the quiet days around it.",
      "Un ciclo por persona, leído de sus propias fechas: sus fases, sus preguntas, sus proyecciones y los días quietos a su alrededor.",
    ],
    topics: [
      {
        id: "el-ciclo",
        title: ["The cycle and its phases", "El ciclo y sus fases"],
        sum: [
          "Vela reads the dates you log into phases and estimates. Days ahead of the record are projections, and the app marks them as such.",
          "Vela lee las fechas que anotas en fases y estimados. Los días por delante del registro son proyecciones, y la app lo marca.",
        ],
        what: [
          "The ring shows where the cycle stands today. Future days are drawn as prediction — marked, lighter — because they are the pattern extended, not dates that happened.",
          "El anillo muestra dónde está el ciclo hoy. Los días futuros se dibujan como predicción — marcados, más tenues — porque son el patrón extendido, no fechas que pasaron.",
        ],
        how: [
          "Log a start and the cycle counts from it; log the next start and the first cycle closes with its real length.\nEstimates come from her own recent cycles — never from a textbook average.\nDays with no record behind them wear the ‘predicted’ mark wherever they appear: the ring, the calendar, the day panel.\nA start dated in the future — a clock that was wrong when it was logged — stays in the record, and the card names it; forecasts count only from the last start before today.",
          "Anota un inicio y el ciclo cuenta desde él; anota el próximo inicio y el primer ciclo se cierra con su duración real.\nLos estimados salen de sus propios ciclos recientes — nunca de un promedio de libro.\nLos días sin registro detrás llevan la marca de «predicho» donde sea que aparezcan: el anillo, el calendario, el panel del día.\nUn inicio con fecha futura — un reloj que estaba mal cuando se anotó — queda en el registro, y la tarjeta lo nombra; el pronóstico cuenta solo desde el último inicio antes de hoy.",
        ],
        calc: [
          "The expected day is the average of her last cycles; ovulation and the fertile window are counted back from it using the luteal days set in the cycle's tuning.",
          "El día esperado es el promedio de sus últimos ciclos; la ovulación y la ventana fértil se cuentan hacia atrás desde él con los días lúteos fijados en el ajuste del ciclo.",
        ],
        example: [
          "Starts on the 2nd, the 30th and the 27th: Vela learns her cycles run about 28 days and expects the next start around the 24th — as an estimate.",
          "Inicios el 2, el 30 y el 27: Vela aprende que sus ciclos duran unos 28 días y espera el próximo inicio hacia el 24 — como estimado.",
        ],
        cases: [
          "A start marked by mistake: the card offers Undo for a few seconds. Later, the start can be removed in [[Settings]] → Cycle & couple diary → Cycle, under Period starts — the estimates re-form from the starts that remain.",
          "Un inicio marcado por error: la tarjeta ofrece Deshacer durante unos segundos. Después, el inicio se puede quitar en [[Ajustes]] → Ciclo y diario de pareja → Ciclo, en Inicios del periodo: los estimados se rehacen con los inicios que quedan.",
        ],
        related: ["varios-ciclos", "el-ciclo-pregunta"],
        go: { tab: "home", spot: "cycle-card", where: ["Home, the cycle card", "Inicio, la tarjeta del ciclo"] },
        terms: [["period", "periodo"], ["ovulation", "ovulación"], ["fertile", "fértil"]],
      },
      {
        id: "varios-ciclos",
        title: ["One cycle per person", "Un ciclo por persona"],
        sum: [
          "Up to eight people can each keep their own cycle — their own dates, history and settings, never touching each other's.",
          "Hasta ocho personas pueden llevar cada una su propio ciclo: sus fechas, su historial y sus ajustes, sin tocarse nunca entre sí.",
        ],
        what: [
          "Each person's cycle is separate: her starts never move another's phases. A paused cycle keeps its history and hides from the card and the calendar.",
          "El ciclo de cada persona es aparte: sus inicios nunca mueven las fases de otra. Un ciclo en pausa conserva su historial y se oculta de la tarjeta y del calendario.",
        ],
        how: [
          "Add a person from the cycle card, or by tapping her name on a [[History]] card.\nEight working cycles fit; a slot that was never really used can be revived instead of counting against you.\nSwitch people on the cycle card; the calendar follows the person selected.",
          "Añade a una persona desde la tarjeta del ciclo, o tocando su nombre en una tarjeta del [[Historial]].\nCaben ocho ciclos en uso; un hueco que nunca se usó de verdad puede revivirse en vez de contar en tu contra.\nCambia de persona en la tarjeta del ciclo; el calendario sigue a la persona elegida.",
        ],
        example: [
          "Her cycle starts on the 5th, another partner's on the 19th: each card, each calendar and each phase follows its own dates only.",
          "Su ciclo empieza el 5, el de otra pareja el 19: cada tarjeta, cada calendario y cada fase sigue solo sus propias fechas.",
        ],
        cases: [
          "Two people with the same name: their moments would read against one cycle — rename one of them to keep the cycles apart.",
          "Dos personas con el mismo nombre: sus momentos se leerían contra un solo ciclo — renombra a una para mantener los ciclos aparte.",
        ],
        mistake: [
          "Pausing a cycle to hide it for a day. Pausing is for a season — pregnancy, a break — and the card and calendar both go quiet about her until it resumes.",
          "Pausar un ciclo para ocultarlo un día. La pausa es para una temporada — un embarazo, una separación — y la tarjeta y el calendario se callan sobre ella hasta que se reanuda.",
        ],
        related: ["el-ciclo", "archivar"],
        go: { tab: "home", spot: "tracker-switch", where: ["Home, the cycle card's person switch", "Inicio, el cambio de persona de la tarjeta del ciclo"] },
        terms: [["tracker", "rastreador"], ["multiple partners", "varias parejas"]],
      },
      {
        id: "el-ciclo-pregunta",
        title: ["When the cycle asks", "Cuando el ciclo pregunta"],
        sum: [
          "When a cycle closes outside her own pattern, Vela asks once what she knows — with plain options. ‘Not now’ is also an answer, and it is kept.",
          "Cuando un ciclo se cierra fuera de su propio patrón, Vela pregunta una vez lo que ella sabe — con opciones llanas. «Ahora no» también es una respuesta, y se guarda.",
        ],
        what: [
          "The question comes only after the cycle has closed, and it asks what happened — it never suggests a cause. The answer is a note on that cycle, and it never changes any estimate.",
          "La pregunta llega solo después de que el ciclo se cerró, y pregunta qué pasó — nunca sugiere una causa. La respuesta es una nota en ese ciclo, y nunca cambia ningún estimado.",
        ],
        how: [
          "The question shows the measured fact: how long this cycle ran, and what her recent ones ran.\nChoose a reason, write your own, or tap ‘Not now’ — that cycle will never be asked about again, on any device.\nIf the start date is corrected later, the answer moves with it.\nAfter two changed cycles asked in a row, the asking rests until a usual cycle passes.\nThe questions can be turned off entirely in the cycle's tuning.",
          "La pregunta muestra el hecho medido: cuánto duró este ciclo, y lo que duraron sus recientes.\nElige una razón, escribe la tuya, o toca «Ahora no»: por ese ciclo nunca se volverá a preguntar, en ningún dispositivo.\nSi la fecha de inicio se corrige después, la respuesta se mueve con ella.\nTras dos ciclos cambiados preguntados seguidos, la pregunta descansa hasta que pase un ciclo usual.\nLas preguntas pueden apagarse por completo en el ajuste del ciclo.",
        ],
        example: [
          "A cycle of 42 days after months of 28: Vela asks, and ‘Morning-after pill’ becomes the note that Statistics later counts — as a note, never as a cause.",
          "Un ciclo de 42 días tras meses de 28: Vela pregunta, y «Pastilla del día después» se vuelve la nota que Estadísticas contará después — como nota, nunca como causa.",
        ],
        cases: [
          "The very first cycles, while her pattern is still forming: Vela stays quiet — there is no ‘outside the pattern’ before a pattern exists.\nA cycle still running: it is never asked about mid-way; the question waits for the day it closes.",
          "Los primeros ciclos, mientras su patrón aún se forma: Vela se queda callada — no hay «fuera del patrón» antes de que exista un patrón.\nUn ciclo aún en curso: nunca se pregunta por él a mitad de camino; la pregunta espera al día en que se cierra.",
        ],
        related: ["fuera-del-patron", "proyeccion"],
        go: { tab: "home", spot: "cycle-card", where: ["Home, on the cycle card", "Inicio, en la tarjeta del ciclo"] },
        terms: [["irregular", "fuera del patrón"], ["morning-after pill", "pastilla del día después"], ["stress", "estrés"]],
      },
      {
        id: "proyeccion",
        title: ["A noted pregnancy, a projected calendar", "Embarazo anotado, calendario en proyección"],
        sum: [
          "When a pregnancy is noted, the calendar ahead becomes a projection — how the cycles would have run — instead of a period that never comes.",
          "Cuando hay un embarazo anotado, el calendario que sigue se vuelve una proyección — cómo se habrían visto los ciclos — en vez de un periodo que nunca llega.",
        ],
        what: [
          "Nothing turns red and nothing counts late days. The card says plainly that a pregnancy is noted and everything ahead is projected, until real dates are logged again.",
          "Nada se pone rojo y nada cuenta días de atraso. La tarjeta dice llanamente que hay un embarazo anotado y que todo lo que sigue es proyección, hasta que se anoten fechas reales otra vez.",
        ],
        how: [
          "The note arrives by the cycle question, or by your own words kept at the [[batch door]].\nProjections extend her recent cycles at their usual length, every projected day marked as predicted.\nAfter the birth, log the real dates as they come: the record corrects itself from there, and the projection ends.",
          "La nota llega por la pregunta del ciclo, o por tus propias palabras conservadas en la [[puerta del lote]].\nLas proyecciones extienden sus ciclos recientes con su duración usual, cada día proyectado marcado como predicho.\nTras el nacimiento, anota las fechas reales como lleguen: el registro se corrige desde ahí, y la proyección termina.",
        ],
        example: [
          "Noted in June, the calendar projects July, August and September as quiet cycles — and the day you log a real start, the projection ends and the true cycle begins.",
          "Anotado en junio, el calendario proyecta julio, agosto y septiembre como ciclos tranquilos — y el día que anotas un inicio real, la proyección termina y comienza el ciclo verdadero.",
        ],
        cases: [
          "The pregnancy ends, in any way: answering the cycle question with that fact closes the projection, and the record keeps the note with the dignity of a fact, never a statistic.\nA start logged during the projection: it is read as a real date, the projection steps aside, and the true cycle takes over from there.",
          "El embarazo termina, de cualquier manera: responder la pregunta del ciclo con ese hecho cierra la proyección, y el registro guarda la nota con la dignidad de un hecho, nunca de una estadística.\nUn inicio anotado durante la proyección: se lee como fecha real, la proyección se aparta, y el ciclo verdadero toma el relevo desde ahí.",
        ],
        related: ["el-ciclo-pregunta", "propuestas-lector"],
        go: { tab: "home", spot: "cycle-projected", where: ["Home, on the cycle card", "Inicio, en la tarjeta del ciclo"] },
        terms: [["pregnancy", "embarazo"], ["late", "atraso"]],
      },
      {
        id: "dias-quietos",
        title: ["Quiet days have names", "Los días quietos tienen nombre"],
        sum: [
          "A stretch without moments can be named — Work, Travel, The children, Health, We argued, Distance, Just life — and the name travels with the silence.",
          "Un tramo sin momentos puede nombrarse — Trabajo, Viaje, Los niños, Salud, Discutimos, Distancia, Solo la vida — y el nombre viaja con el silencio.",
        ],
        what: [
          "Naming a stretch is not a problem list: it's the diary remembering why. The Advisor reads a named stretch as explained, and ‘Just life’ is a complete answer.",
          "Nombrar un tramo no es una lista de problemas: es el diario recordando por qué. El Asesor lee un tramo nombrado como explicado, y «Solo la vida» es una respuesta completa.",
        ],
        how: [
          "In [[Calendar]], open a day and name the stretch; move the end date to cover more days.\nA day with a moment in it breaks the stretch when it's read — the name never covers a day that wasn't quiet.\nYour batch words can propose a name too, with the sentence it heard; it saves only when you keep the proposal.",
          "En el [[Calendario]], abre un día y nombra el tramo; mueve la fecha final para cubrir más días.\nUn día con un momento rompe el tramo al leerse: el nombre nunca cubre un día que no fue quieto.\nTus palabras del lote también pueden proponer un nombre, con la frase que escuchó; se guarda solo si conservas la propuesta.",
        ],
        example: [
          "Thirty-three quiet days named Work: the Advisor says ‘Your journal names this stretch: Work’ instead of reading the silence as distance.",
          "Treinta y tres días quietos nombrados Trabajo: el Asesor dice «Tu diario nombra este tramo: Trabajo» en vez de leer el silencio como distancia.",
        ],
        mistake: [
          "Naming days that haven't happened. Future marks are kept, but nothing reads them until they arrive.",
          "Nombrar días que aún no pasan. Las marcas futuras se guardan, pero nada las lee hasta que llegan.",
        ],
        cases: [
          "A stretch named, then a moment lands inside it: the stretch breaks around that day when read — the name keeps only the days that stayed quiet.",
          "Un tramo nombrado, y luego un momento cae dentro de él: el tramo se rompe alrededor de ese día al leerse — el nombre conserva solo los días que siguieron quietos.",
        ],
        related: ["el-asesor", "propuestas-lector"],
        go: { tab: "calendar", spot: "quiet-block", where: ["Calendar, under a day", "Calendario, bajo un día"] },
        terms: [["gap", "silencio"], ["dry spell", "racha quieta"]],
      },
    ],
  },
  {
    id: "estadisticas",
    title: ["Statistics and the Advisor", "Estadísticas y el Asesor"],
    intro: [
      "One reading of the diary feeds both: cards that count what the record holds, and a voice that speaks only when a sentence is earned.",
      "Una sola lectura del diario alimenta a ambos: tarjetas que cuentan lo que el registro guarda, y una voz que habla solo cuando una frase está ganada.",
    ],
    topics: [
      {
        id: "como-lee",
        title: ["How Statistics read", "Cómo lee Estadísticas"],
        sum: [
          "Every card in Statistics is computed from the same reading of your diary — and a card only exists when there is something true to say.",
          "Cada tarjeta de Estadísticas se calcula de la misma lectura de tu diario — y una tarjeta solo existe cuando hay algo verdadero que decir.",
        ],
        what: [
          "Thin diary, small Statistics: cards appear when their evidence exists and quietly don't before that. Nothing is padded, and nothing is borrowed from other people's data.",
          "Diario delgado, Estadísticas pequeña: las tarjetas aparecen cuando su evidencia existe y, antes, simplemente no. Nada se rellena, y nada se toma de los datos de otros.",
        ],
        how: [
          "The dials card averages what you rated; unrated moments count in the totals but never invent a rating.\nGrouped cards — by person, by place, by position — average the glow of the moments in each group.\nTapping a period or a comparison bar opens [[History]] on exactly those days.",
          "La tarjeta de medidores promedia lo que calificaste; los momentos sin calificar cuentan en los totales pero nunca inventan una calificación.\nLas tarjetas agrupadas — por persona, por lugar, por posición — promedian el resplandor de los momentos de cada grupo.\nTocar un periodo o una barra de comparación abre el [[Historial]] en exactamente esos días.",
        ],
        example: [
          "Three moments in a month: Statistics shows totals and the busiest weekday, while the rhythm and pattern lines wait for more diary.",
          "Tres momentos en un mes: Estadísticas muestra los totales y el día más activo, mientras las líneas de ritmo y patrón esperan más diario.",
        ],
        cases: [
          "A person archived with her Statistics switch off: her moments leave every card here at once — the record is untouched, only the reading changes.\nA card you saw last month is gone today: its evidence fell below what the sentence needs, or the person behind it was archived — cards follow the record, not a fixed layout.",
          "Una persona archivada con su interruptor de Estadísticas apagado: sus momentos salen de todas las tarjetas aquí de una vez — el registro no se toca, solo cambia la lectura.\nUna tarjeta que viste el mes pasado ya no está hoy: su evidencia cayó por debajo de lo que la frase necesita, o la persona detrás fue archivada — las tarjetas siguen al registro, no a un diseño fijo.",
        ],
        related: ["el-asesor", "fuera-del-patron"],
        go: { tab: "insights", spot: "insights-top", where: ["Insights, at the top", "Estadísticas, arriba"] },
        terms: [["averages", "promedios"], ["charts", "gráficas"]],
      },
      {
        id: "fuera-del-patron",
        title: ["Outside the pattern", "Fuera del patrón"],
        sum: [
          "The notes from the cycle questions, counted per person: which reasons her changed cycles carry — counted as notes, never turned into causes.",
          "Las notas de las preguntas del ciclo, contadas por persona: qué razones llevan sus ciclos cambiados — contadas como notas, nunca convertidas en causas.",
        ],
        what: [
          "This card counts your own words back to you. A pregnancy and the end of a pregnancy are never bars or rankings: each is one plain sentence, at most.",
          "Esta tarjeta te devuelve tus propias palabras contadas. Un embarazo y el fin de un embarazo nunca son barras ni rankings: cada uno es una frase llana, como máximo.",
        ],
        how: [
          "Only cycles that ran outside her own pattern and carry a note are counted; ‘I don't know’ is the absence of a note and appears nowhere.\nCycles are never pooled across people — each person gets her own card.\nThe card exists only when at least one changed cycle carries a note.",
          "Solo se cuentan los ciclos que corrieron fuera de su propio patrón y llevan una nota; «No lo sé» es la ausencia de una nota y no aparece en ninguna parte.\nLos ciclos nunca se juntan entre personas: cada una tiene su propia tarjeta.\nLa tarjeta existe solo cuando al menos un ciclo cambiado lleva una nota.",
        ],
        example: [
          "Three changed cycles, two noted Stress: the card shows Stress with a count of two. It does not say stress changed the cycles — you said the word, it counted it.",
          "Tres ciclos cambiados, dos con la nota Estrés: la tarjeta muestra Estrés con un conteo de dos. No dice que el estrés cambió los ciclos: tú dijiste la palabra, ella la contó.",
        ],
        cases: [
          "A changed cycle answered ‘Not now’: it carries no note, so it is counted nowhere here — the dismissal is kept as data, never as a reason.\nThe same word on cycles of two different people: two separate cards, two separate counts — her pattern is never read through someone else's.",
          "Un ciclo cambiado respondido «Ahora no»: no lleva nota, así que no se cuenta en ninguna parte aquí — el descarte se guarda como dato, nunca como razón.\nLa misma palabra en ciclos de dos personas distintas: dos tarjetas aparte, dos conteos aparte — su patrón nunca se lee a través del de otra.",
        ],
        related: ["el-ciclo-pregunta", "el-asesor"],
        go: { tab: "insights", spot: "cycle-reasons-card", where: ["Insights, in the cycle family", "Estadísticas, en la familia de ciclos"] },
        terms: [["reasons", "razones"], ["pattern", "patrón"]],
      },
      {
        id: "pruebas",
        title: ["Pregnancy tests, as stated", "Las pruebas, tal como fueron dichas"],
        sum: [
          "Tests the diary has heard are kept as events — how many, with what results, and when the last one was — counted exactly as they were stated.",
          "Las pruebas que el diario ha escuchado se guardan como eventos — cuántas, con qué resultados y cuándo fue la última — contadas exactamente como fueron dichas.",
        ],
        what: [
          "A test enters the record through your words, at the batch door, never by itself. Statistics counts what you said: ‘two negative and one positive’ is three tests.",
          "Una prueba entra al registro por tus palabras, en la puerta del lote, nunca por sí sola. Estadísticas cuenta lo que dijiste: «dos negativas y una positiva» son tres pruebas.",
        ],
        how: [
          "Each kept proposal saves an event with its date, its result, and how many it stated.\nThe card totals them and names the last one — its result and its date.\nA test whose result your words never stated is not recorded.",
          "Cada propuesta conservada guarda un evento con su fecha, su resultado y cuántas declaró.\nLa tarjeta las suma y nombra la última: su resultado y su fecha.\nUna prueba cuyo resultado tus palabras nunca dijeron no se registra.",
        ],
        example: [
          "October 30 — two negative, one positive. The card reads: ‘3 pregnancy tests stand in the record: 1 positive, 2 negative. The last one was positive, on Oct 30.’",
          "30 de octubre: dos negativas, una positiva. La tarjeta dice: «3 pruebas de embarazo constan en el registro: 1 con resultado positivo, 2 con resultado negativo. La última fue positiva, el 30 de oct.»",
        ],
        cases: [
          "A test mentioned as a plan — ‘she'll take a test tomorrow’: nothing is recorded; only a test your words say happened becomes an event.\nTests stated on different days: each day keeps its own event, and the card's ‘last one’ is always the most recent date, not the last one you typed.",
          "Una prueba mencionada como plan — «se hará una prueba mañana»: no se registra nada; solo una prueba que tus palabras dicen que ocurrió se vuelve evento.\nPruebas dichas en días distintos: cada día guarda su propio evento, y la «última» de la tarjeta es siempre la fecha más reciente, no la última que escribiste.",
        ],
        mistake: [
          "Reading the totals as a verdict. The card counts what was stated, in your words — it never weighs one result against another.",
          "Leer los totales como un veredicto. La tarjeta cuenta lo que fue dicho, en tus palabras: nunca sopesa un resultado contra otro.",
        ],
        related: ["propuestas-lector", "proyeccion"],
        go: { tab: "insights", spot: "cycle-tests-card", where: ["Insights, in the cycle family", "Estadísticas, en la familia de ciclos"] },
        terms: [["positive", "positiva"], ["negative", "negativa"]],
      },
      {
        id: "el-asesor",
        title: ["The Advisor watches", "El Asesor vigila"],
        sum: [
          "The Advisor reads the same diary as Statistics and speaks only when the record supports a sentence — about dates, patterns and the last time. It never diagnoses.",
          "El Asesor lee el mismo diario que Estadísticas y habla solo cuando el registro sostiene una frase: sobre fechas, patrones y la última vez. Nunca diagnostica.",
        ],
        what: [
          "Its job is to watch for change and say it plainly, with its number inside the sentence. With little diary it says little; it would rather be silent than invent.",
          "Su trabajo es vigilar los cambios y decirlos llanamente, con su número dentro de la frase. Con poco diario dice poco; prefiere callar antes que inventar.",
        ],
        how: [
          "Dates come first: an anniversary today is the headline, and the week's dates join below.\nThen its standing lines — the rhythm, the last changed cycle and its note — and one rotating fact the record has earned.\nNamed quiet stretches change what it says: explained time is never read as distance.",
          "Las fechas van primero: un aniversario hoy es el titular, y las fechas de la semana se unen debajo.\nLuego sus líneas fijas — el ritmo, el último ciclo cambiado y su nota — y un hecho rotativo que el registro se haya ganado.\nLos tramos quietos nombrados cambian lo que dice: el tiempo explicado nunca se lee como distancia.",
        ],
        example: [
          "‘Nine years married to Ana today. Congratulations.’ The Advisor congratulates the time; it will never grade the years.",
          "«Nueve años de casados con Ana hoy. Felicidades.» El Asesor felicita el tiempo; nunca calificará los años.",
        ],
        mistake: [
          "Reading its silence as a fault. A quiet Advisor means the record doesn't support a claim yet.",
          "Leer su silencio como una falla. Un Asesor callado significa que el registro aún no sostiene ninguna afirmación.",
        ],
        cases: [
          "An anniversary and a long quiet stretch on the same day: the date leads, and the stretch is read through its name if it has one — celebration first, explanation second.",
          "Un aniversario y un tramo quieto largo el mismo día: la fecha encabeza, y el tramo se lee por su nombre si lo tiene — primero la celebración, luego la explicación.",
        ],
        related: ["como-lee", "fechas", "dias-quietos"],
        go: { tab: "insights", spot: "advisor-card", where: ["Insights, the Advisor card", "Estadísticas, la tarjeta del Asesor"] },
        terms: [["advice", "consejo"], ["coach", "asesor"]],
      },
      {
        id: "las-dos-voces",
        title: ["Two voices, read together", "Las dos voces, leídas juntas"],
        sum: [
          "Where both of you rated the same moment, Statistics places the two readings side by side — agreement as a distribution, never a score.",
          "Donde ambos calificaron el mismo momento, Estadísticas pone las dos lecturas lado a lado: el acuerdo como distribución, nunca como nota.",
        ],
        what: [
          "There is no compatibility percentage and no winner. A dial where your readings differ is shown as two true readings — hers beside yours.",
          "No hay porcentaje de compatibilidad ni ganador. Un medidor donde sus lecturas difieren se muestra como dos lecturas verdaderas: la de ella junto a la tuya.",
        ],
        how: [
          "The card appears in couple mode once enough moments carry both voices.\nEach dial shows both averages, and in how many of those moments you read it the same.\nThe Advisor may name the dial where you differ most — as a conversation, never a verdict.",
          "La tarjeta aparece en modo pareja cuando bastantes momentos llevan ambas voces.\nCada medidor muestra ambos promedios, y en cuántos de esos momentos lo leyeron igual.\nEl Asesor puede nombrar el medidor donde más difieren: como conversación, nunca como veredicto.",
        ],
        example: [
          "Connection — yours around 4.6, hers around 2.8, the same in 2 of 5. Two readings, both true: that is the whole sentence.",
          "Conexión: la tuya cerca de 4.6, la de ella cerca de 2.8, iguales en 2 de 5. Dos lecturas, ambas verdaderas: esa es toda la frase.",
        ],
        cases: [
          "Only one of you rated a moment: it never enters this card — a pair needs both readings, and a single voice is read by the ordinary cards instead.\nA dial she left unrated on a moment you both otherwise read: that dial simply has one fewer pair; the others still count.",
          "Solo uno de los dos calificó un momento: nunca entra en esta tarjeta — un par necesita ambas lecturas, y una voz sola la leen las tarjetas ordinarias.\nUn medidor que ella dejó sin calificar en un momento que ambos leyeron en lo demás: ese medidor simplemente tiene un par menos; los demás siguen contando.",
        ],
        mistake: [
          "Reading a wide gap on one dial as a problem to fix. The card reports two honest readings; what they mean is a conversation, and the diary takes no side in it.",
          "Leer una brecha ancha en un medidor como un problema a arreglar. La tarjeta reporta dos lecturas honestas; lo que significan es una conversación, y el diario no toma partido en ella.",
        ],
        related: ["su-voz", "el-asesor"],
        go: { tab: "insights", spot: "two-voices", where: ["Insights, the Both voices card", "Estadísticas, la tarjeta de Las dos voces"] },
        terms: [["agreement", "acuerdo"], ["compatibility", "compatibilidad"]],
      },
    ],
  },
  {
    id: "pareja",
    title: ["The couple diary", "El diario de pareja"],
    intro: [
      "One account, two people: how the shared diary is turned on, signed, governed — and left.",
      "Una cuenta, dos personas: cómo se activa el diario compartido, cómo se firma, cómo se gobierna — y cómo se sale de él.",
    ],
    topics: [
      {
        id: "activar-pareja",
        title: ["Turning on the couple diary", "Activar el diario de pareja"],
        sum: [
          "One account, two people, no secrets inside it: from the day you turn it on, everything in this diary is visible to both of you.",
          "Una cuenta, dos personas, ningún secreto dentro: desde el día en que lo activas, todo en este diario es visible para ambos.",
        ],
        what: [
          "The ceremony says it plainly before anything changes: there is no private corner in a shared diary. You choose how much of the existing journal becomes shared, and each of you sets a PIN.",
          "La ceremonia lo dice llanamente antes de que nada cambie: no hay rincón privado en un diario compartido. Eliges cuánto del diario existente se vuelve compartido, y cada uno fija su PIN.",
        ],
        how: [
          "Three steps: the law, the scope — everything, from today, or from a date you pick — and the two people with their [[PINs]].\nHer existing cycles are bound to her by name, so her record follows her into the shared diary.\nTurning the mode off keeps all the history; the diary simply becomes one person's again.",
          "Tres pasos: la ley, el alcance — todo, desde hoy, o desde una fecha que eliges — y las dos personas con sus [[PIN]].\nSus ciclos existentes se atan a ella por nombre, así su registro la sigue al diario compartido.\nApagar el modo conserva todo el historial; el diario simplemente vuelve a ser de una persona.",
        ],
        example: [
          "You turn it on from today: everything before stays the owner's voice; from today, each moment can carry hers too.",
          "Lo activas desde hoy: todo lo anterior queda como la voz del dueño; desde hoy, cada momento puede llevar también la de ella.",
        ],
        cases: [
          "You share from a date you pick: moments before that date keep the owner's voice only, even if she was there — the scope is a line the diary respects exactly.\nOne of you has no cycles bound to her name yet: her cycle binds the first time her name meets a start date inside the shared diary.",
          "Compartes desde una fecha que eliges: los momentos anteriores a esa fecha conservan solo la voz del dueño, aunque ella estuviera ahí — el alcance es una línea que el diario respeta exactamente.\nUna de las dos aún no tiene ciclos atados a su nombre: su ciclo se ata la primera vez que su nombre encuentra una fecha de inicio dentro del diario compartido.",
        ],
        related: ["pines", "su-voz", "salir"],
        go: { settings: "couple", spot: "couple-section", where: ["Settings → Cycle & couple diary → Couple diary", "Ajustes → Ciclo y diario de pareja → Diario de pareja"] },
        terms: [["shared account", "cuenta compartida"], ["partner", "pareja"]],
      },
      {
        id: "pines",
        title: ["What a PIN is — and is not", "Qué es un PIN, y qué no"],
        sum: [
          "A PIN signs a voice or an agreement inside the open diary. It is an attribution signature — not a password, not a wall.",
          "Un PIN firma una voz o un acuerdo dentro del diario abierto. Es una firma de autoría — no una contraseña, no un muro.",
        ],
        what: [
          "Whoever holds the diary's passphrase can open everything; a PIN only says ‘this was written, or agreed, by the person whose PIN it is’. It hides nothing.",
          "Quien tenga la frase del diario puede abrirlo todo; un PIN solo dice «esto lo escribió, o lo acordó, la persona cuyo PIN es». No esconde nada.",
        ],
        how: [
          "A PIN is asked at authorship moments: signing [[her voice]], approving a [[shared decision]].\nIt is 4 to 6 digits, stored only as a salted hash inside the encrypted diary.\nA forgotten PIN is reset only with the other partner's consent — authorship is never reassigned alone.",
          "El PIN se pide en los momentos de autoría: firmar [[su voz]], aprobar una [[decisión compartida]].\nSon de 4 a 6 dígitos, guardados solo como huella con sal dentro del diario cifrado.\nUn PIN olvidado se restablece solo con el consentimiento de la otra persona: la autoría nunca se reasigna en solitario.",
        ],
        example: [
          "She approves deleting a shared moment with her PIN: the diary records that the consent was hers, by her signature.",
          "Ella aprueba eliminar un momento compartido con su PIN: el diario registra que el consentimiento fue suyo, por su firma.",
        ],
        mistake: [
          "Treating the PIN as a lock. The diary's real key is the passphrase; the PIN signs, it does not guard.",
          "Tratar el PIN como un candado. La llave real del diario es la frase; el PIN firma, no guarda.",
        ],
        cases: [
          "Your own proposal needs her signature: the diary refuses your PIN on it, however many times it is entered — consent only ever comes from the other chair.",
          "Tu propia propuesta necesita su firma: el diario rechaza tu PIN en ella, cuantas veces se ingrese — el consentimiento solo viene de la otra silla.",
        ],
        related: ["activar-pareja", "decisiones", "tu-frase"],
        go: { settings: "couple", spot: "couple-section", where: ["Settings → Cycle & couple diary → Couple diary", "Ajustes → Ciclo y diario de pareja → Diario de pareja"] },
        terms: [["signature", "firma"], ["code", "código"]],
      },
      {
        id: "su-voz",
        title: ["Her voice on a moment", "Su voz en un momento"],
        sum: [
          "A moment can carry a second voice: her own five dials and her own words, added by her, editable only by her.",
          "Un momento puede llevar una segunda voz: sus propios cinco medidores y sus propias palabras, añadidos por ella, editables solo por ella.",
        ],
        what: [
          "She writes her voice without seeing yours first — both readings stay honest. Nobody can edit the other person's voice at all, consent or not.",
          "Ella escribe su voz sin ver la tuya primero: ambas lecturas se mantienen honestas. Nadie puede editar la voz de la otra persona, con o sin consentimiento.",
        ],
        how: [
          "On a moment with her name, ‘Add her voice’ opens the sheet: the shared facts, then her dials and her words, signed with her [[PIN]].\nHer dials compose her note the same way yours compose yours.\nErasing her voice is hers alone and immediate — what is hers needs no agreement.",
          "En un momento con su nombre, «Añadir su voz» abre la hoja: los hechos compartidos, luego sus medidores y sus palabras, firmados con su [[PIN]].\nSus medidores componen su nota igual que los tuyos componen la tuya.\nBorrar su voz es solo suyo e inmediato: lo que es de ella no necesita acuerdo.",
        ],
        example: [
          "You logged the night at 5 for connection. She adds her voice: a 3, with her words. History now shows both, side by side.",
          "Registraste la noche con un 5 en conexión. Ella añade su voz: un 3, con sus palabras. El Historial ahora muestra ambas, lado a lado.",
        ],
        cases: [
          "A round added later with +1: it arrives with no second voice — a copy never carries hers; she adds her own voice to it herself, or it stays single-voiced.\nShe writes her voice on a moment from before the shared scope: the door isn't there — moments outside the scope keep the owner's voice only.",
          "Una ronda añadida después con +1: llega sin segunda voz — una copia nunca lleva la de ella; ella añade su propia voz a esa ronda, o queda con una sola voz.\nElla escribe su voz en un momento anterior al alcance compartido: la puerta no está ahí — los momentos fuera del alcance conservan solo la voz del dueño.",
        ],
        related: ["las-dos-voces", "rondas", "pines"],
        go: { tab: "history", spot: "voice-door", where: ["History, on her moments", "Historial, en sus momentos"] },
        terms: [["second voice", "segunda voz"], ["her ratings", "sus calificaciones"]],
      },
      {
        id: "decisiones",
        title: ["Shared decisions", "Decisiones compartidas"],
        sum: [
          "What belongs to both needs both: deleting a shared moment, a person, or the whole diary is proposed by one and signed by the other — never done alone.",
          "Lo que es de ambos necesita a ambos: eliminar un momento compartido, una persona o el diario entero lo propone uno y lo firma el otro — nunca se hace en solitario.",
        ],
        what: [
          "A proposal waits in Settings, visible to both. The other signs with their PIN; a whole-diary wipe also waits seven days after both agree, and an unsigned proposal simply lapses.",
          "Una propuesta espera en Ajustes, visible para ambos. El otro firma con su PIN; el borrado del diario entero espera además siete días tras el acuerdo, y una propuesta sin firmar simplemente caduca.",
        ],
        how: [
          "Propose from the moment, the encounter, or the person's archive door.\nApproving a single thing runs it at once; approving the whole diary starts the seven-day cooling-off.\nEither of you can cancel any proposal with one tap — cancelling needs no signature.\nA proposal nobody signs within seven days lapses and leaves no mark in the journal.",
          "Propón desde el momento, el encuentro o la puerta de archivo de la persona.\nAprobar una cosa sola la ejecuta enseguida; aprobar el diario entero inicia los siete días de espera.\nCualquiera de los dos puede cancelar cualquier propuesta con un toque: cancelar no necesita firma.\nUna propuesta que nadie firma en siete días caduca y no deja marca en el diario.",
        ],
        example: [
          "You propose deleting a shared trip. She signs on her phone two days later, and it's gone. Had she ignored it for a week, it would have lapsed — silently, as if never proposed.",
          "Propones eliminar un viaje compartido. Ella firma en su teléfono dos días después, y desaparece. Si lo hubiera ignorado una semana, habría caducado — en silencio, como si nunca se hubiera propuesto.",
        ],
        cases: [
          "Your own voice is never a shared decision: erasing it is yours alone, at once.",
          "Tu propia voz nunca es una decisión compartida: borrarla es solo tuyo, enseguida.",
        ],
        related: ["salir", "borrar-todo", "pines"],
        go: { settings: "couple", spot: "proposals-inbox", where: ["Settings → Cycle & couple diary → Couple diary → Shared decisions", "Ajustes → Ciclo y diario de pareja → Diario de pareja → Decisiones compartidas"] },
        terms: [["consent", "consentimiento"], ["proposal", "propuesta"], ["cooling-off", "espera"]],
      },
      {
        id: "salir",
        title: ["Leaving the diary", "Salir del diario"],
        sum: [
          "The exit is always open: export your copy, turn the mode off, and this device forgets. Leaving never erases the diary — that would take both of you.",
          "La salida siempre está abierta: exporta tu copia, apaga el modo, y este dispositivo olvida. Salir nunca borra el diario: eso necesitaría a ambos.",
        ],
        what: [
          "You can stop writing at any moment, alone, without asking. What you take is a full export; what stays is the diary, whole, for the person who remains.",
          "Puedes dejar de escribir en cualquier momento, solo, sin pedir permiso. Lo que te llevas es una exportación completa; lo que queda es el diario, entero, para la persona que permanece.",
        ],
        how: [
          "‘Leave this diary’ offers the [[export]] first, then signs this device out and wipes its local copy.\nThe other person's diary keeps working exactly as before — an exit never bricks anyone.\nDeleting the diary itself is a [[shared decision]], with its own cooling-off.",
          "«Salir de este diario» ofrece primero la [[exportación]], luego cierra la sesión de este dispositivo y borra su copia local.\nEl diario de la otra persona sigue funcionando igual que antes: una salida nunca bloquea a nadie.\nEliminar el diario mismo es una [[decisión compartida]], con su propia espera.",
        ],
        example: [
          "After a split: you export your copy, leave, and your phone forgets the diary. Hers still opens, with her voice intact.",
          "Tras una separación: exportas tu copia, sales, y tu teléfono olvida el diario. El de ella sigue abriendo, con su voz intacta.",
        ],
        cases: [
          "You leave and later return: signing back in asks for the connection and the passphrase, because this device forgot everything on purpose — the diary itself was never touched.\nA proposal is still waiting when you leave: it stays with the diary; your leaving neither signs it nor cancels it.",
          "Sales y luego vuelves: entrar de nuevo pide la conexión y la frase, porque este dispositivo lo olvidó todo a propósito — el diario mismo nunca fue tocado.\nUna propuesta aún espera cuando sales: se queda con el diario; tu salida ni la firma ni la cancela.",
        ],
        mistake: [
          "Leaving to delete something. Leaving removes the diary from this device only; the shared record survives whole, by design.",
          "Salir para eliminar algo. Salir quita el diario solo de este dispositivo; el registro compartido sobrevive entero, por diseño.",
        ],
        related: ["decisiones", "copias"],
        go: { settings: "couple", spot: "couple-leave", where: ["Settings → Cycle & couple diary → Couple diary", "Ajustes → Ciclo y diario de pareja → Diario de pareja"] },
        terms: [["exit", "salida"], ["breakup", "separación"]],
      },
    ],
  },
  {
    id: "a-salvo",
    title: ["Keeping your diary safe", "Tu diario, a salvo"],
    intro: [
      "How the diary travels between devices, how it leaves as a copy — and the one door with no way back.",
      "Cómo viaja el diario entre dispositivos, cómo sale como copia — y la única puerta sin vuelta atrás.",
    ],
    topics: [
      {
        id: "sincronizacion",
        title: ["Sync, decided by revision", "Sincronización por revisión"],
        sum: [
          "Vela syncs by revision, never by clock: the newer copy of the diary wins, and if both changed, both are kept and you are asked.",
          "Vela sincroniza por revisión, nunca por reloj: gana la copia más nueva del diario, y si ambas cambiaron, ambas se guardan y se te pregunta.",
        ],
        what: [
          "If two devices edited offline, sync doesn't guess by the time on the clock. The copy that would be overwritten is downloaded as a backup first — nothing is silently lost.",
          "Si dos dispositivos editaron sin conexión, la sincronización no adivina por la hora del reloj. La copia que sería sobrescrita se descarga primero como respaldo: nada se pierde en silencio.",
        ],
        how: [
          "Each save raises the diary's revision; the cloud accepts a copy only on top of the revision it saw.\nA real conflict keeps the incoming copy as an encrypted backup you can restore.\nOffline work is never blocked: it saves on the device and syncs when it can.",
          "Cada guardado sube la revisión del diario; la nube acepta una copia solo sobre la revisión que vio.\nUn conflicto real guarda la copia entrante como respaldo cifrado que puedes restaurar.\nEl trabajo sin conexión nunca se bloquea: se guarda en el dispositivo y se sincroniza cuando puede.",
        ],
        example: [
          "You edit on your phone in a plane while she adds a voice at home: on landing, Vela keeps both versions and asks — it doesn't pick a winner by the clock.",
          "Editas en tu teléfono en un avión mientras ella añade una voz en casa: al aterrizar, Vela guarda ambas versiones y pregunta — no elige un ganador por el reloj.",
        ],
        cases: [
          "Your phone's clock is wrong by hours: nothing changes — sync never reads the clock, only the diary's revision.\nYou choose the cloud copy in a conflict: your device copy is not destroyed; it waits as the encrypted backup the conflict kept.",
          "El reloj de tu teléfono está mal por horas: nada cambia — la sincronización nunca lee el reloj, solo la revisión del diario.\nEliges la copia de la nube en un conflicto: la copia de tu dispositivo no se destruye; espera como el respaldo cifrado que el conflicto guardó.",
        ],
        related: ["puerta-sin-conexion", "copias"],
        go: { settings: "data", spot: "sync-section", where: ["Settings → Privacy & data → Data & sync", "Ajustes → Privacidad y datos → Datos y sincronización"] },
        terms: [["conflict", "conflicto"], ["cloud", "nube"]],
      },
      {
        id: "copias",
        title: ["Backups and exports", "Copias y exportaciones"],
        sum: [
          "Your diary can leave as a sealed backup, as readable JSON, or as a spreadsheet — and a backup restores the diary exactly as it was.",
          "Tu diario puede salir como respaldo sellado, como JSON legible o como hoja de cálculo — y un respaldo restaura el diario exactamente como estaba.",
        ],
        what: [
          "A backup is the whole diary, encrypted with your passphrase. Exporting to read gives you the moments as data; neither touches what stays in Vela.",
          "Un respaldo es el diario entero, cifrado con tu frase. Exportar para leer te da los momentos como datos; ninguno de los dos toca lo que queda en Vela.",
        ],
        how: [
          "Back up from [[Settings]] before anything big: a new phone, a shared decision, a restore.\nRestoring asks for the passphrase and replaces the diary with the backup's state, decided by revision.\nThe CSV export lists moments in fixed columns — dates, person, place, ratings — for your own records.",
          "Haz un respaldo desde [[Ajustes]] antes de algo grande: un teléfono nuevo, una decisión compartida, una restauración.\nRestaurar pide la frase y reemplaza el diario con el estado del respaldo, decidido por revisión.\nLa exportación CSV lista los momentos en columnas fijas — fechas, persona, lugar, calificaciones — para tus propios registros.",
        ],
        example: [
          "Before turning on the couple diary, make a backup: if the scope choice ever feels wrong, the solo diary is one restore away.",
          "Antes de activar el diario de pareja, haz un respaldo: si la elección del alcance alguna vez se siente mal, el diario en solitario está a una restauración.",
        ],
        cases: [
          "A backup kept only on the phone it protects: it guards against mistakes, not against losing the phone — keep one copy somewhere else.\nRestoring an older backup over newer work: the revision decides, and the newer state is kept as a backup before anything is replaced.",
          "Un respaldo guardado solo en el teléfono que protege: guarda contra errores, no contra perder el teléfono — guarda una copia en otro lugar.\nRestaurar un respaldo viejo sobre trabajo más nuevo: la revisión decide, y el estado más nuevo se guarda como respaldo antes de que nada se reemplace.",
        ],
        related: ["sincronizacion", "salir", "tu-frase"],
        go: { settings: "data", spot: "backup-section", where: ["Settings → Privacy & data → Data & sync", "Ajustes → Privacidad y datos → Datos y sincronización"] },
        terms: [["restore", "restaurar"], ["download", "descargar"]],
      },
      {
        id: "borrar-todo",
        title: ["Erasing everything", "Borrarlo todo"],
        sum: [
          "Erase-all removes the diary from this account — every moment, cycle and voice. In couple mode it is a shared decision with a week to change your minds.",
          "Borrar todo quita el diario de esta cuenta: cada momento, ciclo y voz. En modo pareja es una decisión compartida con una semana para cambiar de idea.",
        ],
        what: [
          "This is the one door with no way back. Vela asks you to be sure, offers an export first, and — for a couple — waits for both signatures and seven days.",
          "Esta es la única puerta sin vuelta atrás. Vela te pide estar seguro, ofrece primero una exportación y — en pareja — espera ambas firmas y siete días.",
        ],
        how: [
          "Alone, the erase runs when you confirm, after the export offer.\nAs a couple, one proposes and the other signs; the week of cooling-off runs from that second signature.\nCancelling the proposal, by either of you, stops everything and leaves the diary whole.",
          "En solitario, el borrado corre cuando confirmas, tras la oferta de exportar.\nEn pareja, uno propone y el otro firma; la semana de espera corre desde esa segunda firma.\nCancelar la propuesta, cualquiera de los dos, lo detiene todo y deja el diario entero.",
        ],
        example: [
          "Seven days after she signs, the diary can be erased in one tap. On day three, either of you can still cancel — and nothing was ever touched.",
          "Siete días después de que ella firma, el diario puede borrarse con un toque. Al tercer día, cualquiera de los dos aún puede cancelar — y nada fue tocado jamás.",
        ],
        cases: [
          "You only want this device clean: signing out with ‘forget this device’ does that without touching the diary — erase-all is for the diary itself.\nAn export made the same day: it survives the erase, because it already left — erasing reaches the diary, never the copies you took out.",
          "Solo quieres limpio este dispositivo: cerrar sesión con «olvidar este dispositivo» hace eso sin tocar el diario — borrar todo es para el diario mismo.\nUna exportación hecha el mismo día: sobrevive al borrado, porque ya salió — el borrado alcanza al diario, nunca a las copias que sacaste.",
        ],
        related: ["decisiones", "archivar", "copias"],
        go: { settings: "data", spot: "erase-all", where: ["Settings → Privacy & data → Data & sync", "Ajustes → Privacidad y datos → Datos y sincronización"] },
        terms: [["delete everything", "eliminar todo"], ["wipe", "borrado"]],
      },
    ],
  },
];

export const HINT_ONLY: HintOnly[] = [
  {
    id: "no-preguntar",
    into: "el-ciclo-pregunta",
    what: [
      "On: Vela stops asking about cycle changes altogether. The notes already written stay, and Statistics keeps counting them.",
      "Encendido: Vela deja de preguntar por los cambios del ciclo. Las notas ya escritas se quedan, y Estadísticas sigue contándolas.",
    ],
  },
  {
    id: "bandeja-decisiones",
    into: "decisiones",
    what: [
      "Decisions waiting for the other signature live here. Your own PIN can't approve your own proposal — consent only ever comes from the other chair.",
      "Las decisiones que esperan la otra firma viven aquí. Tu propio PIN no puede aprobar tu propia propuesta: el consentimiento solo viene de la otra silla.",
    ],
  },
  {
    id: "respaldo-rapido",
    into: "copias",
    what: [
      "A backup is the whole diary, sealed with your passphrase. Keep it somewhere that is not this phone.",
      "Un respaldo es el diario entero, sellado con tu frase. Guárdalo en algún lugar que no sea este teléfono.",
    ],
  },
  {
    id: "ciclo-en-pausa",
    into: "varios-ciclos",
    what: [
      "Paused: the history stays, but this cycle hides from the card, the calendar and her moments until it resumes.",
      "En pausa: el historial se queda, pero este ciclo se oculta de la tarjeta, del calendario y de sus momentos hasta que se reanude.",
    ],
  },
];

/** [[Name]] terms → the topic whose `go` describes that place. A term may
 *  carry its own `go` when the topic's landing isn't the term's place. */
export const LINKS: Record<string, { topic: string; go?: Go }> = {
  Settings: { topic: "tu-frase", go: { settings: "", where: ["Settings", "Ajustes"] } },
  Ajustes: { topic: "tu-frase", go: { settings: "", where: ["Settings", "Ajustes"] } },
  History: { topic: "buscar", go: { tab: "history", where: ["History", "Historial"] } },
  Historial: { topic: "buscar", go: { tab: "history", where: ["History", "Historial"] } },
  Home: { topic: "registrar", go: { tab: "home", where: ["Home", "Inicio"] } },
  Inicio: { topic: "registrar", go: { tab: "home", where: ["Home", "Inicio"] } },
  Calendar: { topic: "dias-quietos", go: { tab: "calendar", where: ["Calendar", "Calendario"] } },
  Calendario: { topic: "dias-quietos", go: { tab: "calendar", where: ["Calendar", "Calendario"] } },
  Statistics: { topic: "como-lee", go: { tab: "insights", where: ["Statistics", "Estadísticas"] } },
  Estadísticas: { topic: "como-lee", go: { tab: "insights", where: ["Statistics", "Estadísticas"] } },
  "Log a batch": { topic: "lector-lotes" },
  "Registrar un lote": { topic: "lector-lotes" },
  "batch door": { topic: "lector-lotes" },
  "puerta del lote": { topic: "lector-lotes" },
  PINs: { topic: "pines" },
  PIN: { topic: "pines" },
  "her voice": { topic: "su-voz" },
  "su voz": { topic: "su-voz" },
  "shared decision": { topic: "decisiones" },
  "decisión compartida": { topic: "decisiones" },
  export: { topic: "copias" },
  exportación: { topic: "copias" },
};

export type Numbered = Topic & { num: string; chapter: Chapter; chapterNum: number };

export const MANUAL_TOPICS: Numbered[] = MANUAL_CHAPTERS.flatMap((chapter, ci) =>
  chapter.topics.map((topic, ti) => ({ ...topic, num: `${ci + 1}.${ti + 1}`, chapter, chapterNum: ci + 1 })),
);

export function findTopic(id: string): Numbered | undefined {
  return MANUAL_TOPICS.find((topic) => topic.id === id);
}

export type HintEntry = { id: string; what: L; whatAlt?: L; topic: Numbered };

export function findHint(id: string): HintEntry | undefined {
  const topic = findTopic(id);
  if (topic) return { id, what: topic.what, whatAlt: topic.whatAlt, topic };
  const hint = HINT_ONLY.find((h) => h.id === id);
  if (hint) {
    const into = findTopic(hint.into);
    if (into) return { id, what: hint.what, whatAlt: hint.whatAlt, topic: into };
  }
  return undefined;
}

/** All searchable plain text of a topic, [[ ]] stripped. */
export function topicText(topic: Numbered, lang: string): string {
  const parts: string[] = [
    pick(lang, topic.title),
    pick(lang, topic.sum),
    pick(lang, topic.what),
    topic.whatAlt ? pick(lang, topic.whatAlt) : "",
    pick(lang, topic.how),
    topic.calc ? pick(lang, topic.calc) : "",
    pick(lang, topic.example),
    topic.cases ? pick(lang, topic.cases) : "",
    topic.mistake ? pick(lang, topic.mistake) : "",
    topic.go ? pick(lang, topic.go.where) : "",
    ...(topic.terms ?? []).map((term) => pick(lang, term)),
  ];
  for (const hint of HINT_ONLY) {
    if (hint.into === topic.id) parts.push(pick(lang, hint.what));
  }
  return parts.join("\n").replace(/\[\[|\]\]/g, "");
}

export function alphaIndex(lang: string): { letter: string; topics: Numbered[] }[] {
  const byLetter = new Map<string, Numbered[]>();
  const collator = new Intl.Collator(lang === "es" ? "es" : "en", { sensitivity: "base" });
  const sorted = [...MANUAL_TOPICS].sort((a, b) => collator.compare(pick(lang, a.title), pick(lang, b.title)));
  for (const topic of sorted) {
    const letter = pick(lang, topic.title).charAt(0).toUpperCase();
    const list = byLetter.get(letter) ?? [];
    list.push(topic);
    byLetter.set(letter, list);
  }
  return [...byLetter.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([letter, topics]) => ({ letter, topics }));
}

