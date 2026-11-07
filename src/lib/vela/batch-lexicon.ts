/*
 * Vocabulary for the natural-language batch reader (batch.ts).
 * Every pattern is written for FOLDED text: lower case, accents removed
 * (é→e, ñ→n), curly quotes → '. Values are the ids/labels the app stores:
 * places and positions use the catalog's English labels, contraception and
 * problems use their ids. Rating values are levels 1–5 on the app's own scales.
 */

export type Rule = {
  kind: "place" | "position" | "method" | "problem" | "rating" | "overall" | "block" | "multi";
  value: string;
  re: RegExp;
  /** Higher wins when two matches overlap. Ties go to the longer match. */
  prio?: number;
  /** For rating rules: which dimension. */
  dim?: "intensity" | "connection" | "satisfaction" | "energy";
  level?: number;
  /** The phrase carries its own negation ("no condom" style), so skip the negation check. */
  selfNeg?: boolean;
};

const r = (source: string) => new RegExp(`\\b(?:${source})\\b`, "g");

// ---------------------------------------------------------------- places
export const PLACE_RULES: Rule[] = [
  { kind: "place", value: "Bedroom", re: r("bedroom|in bed|on the bed|(?:my|her|his|our|the|their) room|cama|cuarto|habitacion|recamara|dormitorio|alcoba|bed") },
  { kind: "place", value: "Living room", re: r("living ?room|couch|sofa|lounge|sala de estar|sala|sillon") },
  { kind: "place", value: "Shower", re: r("showers?|bathtub|bath tub|jacuzzi|ducha|duchandonos|banera|regadera|shower sex") },
  { kind: "place", value: "Car", re: r("car|truck|back ?seat|carro|coche|auto|camioneta") },
  { kind: "place", value: "Hotel", re: r("hotel|motel|airbnb|resort|hostal") },
  { kind: "place", value: "Outdoors", re: r("outdoors|beach|park|woods|forest|camping|tent|pool|lake|river|in the sea|in the ocean|playa|parque|bosque|al aire libre|en el mar|piscina|alberca|lago|rio|outside") },
  { kind: "place", value: "Office", re: r("office|at work|oficina|en el trabajo|desk|escritorio") },
];

// ---------------------------------------------------------------- positions
export const POSITION_RULES: Rule[] = [
  { kind: "position", value: "Reverse Cowgirl", prio: 2, re: r("reverse cowgirl|reverse riding|vaquera (?:invertida|al reves|de espaldas)|reversa") },
  { kind: "position", value: "Missionary", re: r("missionary|misionero|misionera|man on top") },
  { kind: "position", value: "Doggy", re: r("doggy ?style|doggystyle|doggy|doggie|from behind|de (?:a )?perrito|perrito|en cuatro|a cuatro patas|cuatro patas|en 4|por detras") },
  { kind: "position", value: "Cowgirl", re: r("cowgirl|she (?:was|got|climbed) on top|she rode me|she was riding me|riding me|rode me|on top of me|she rode|vaquera|ella (?:arriba|encima)|(?:me|lo) (?:monto|cabalgo)|cabalgando|montandome") },
  { kind: "position", value: "Spooning", re: r("spooning|spoon|cucharita|cuchara|de lado|side by side|on our sides") },
  { kind: "position", value: "Standing", re: r("standing(?: up)?|stood|against the wall|up against|de pie|parados|paraditos|contra la pared") },
  { kind: "position", value: "69", prio: 2, re: /(?<![\d/:.,])\b(?:69|sixty[- ]?nine|sesenta y nueve)\b(?![\d/:])/g },
  { kind: "position", value: "Oral", re: r("oral|blow ?jobs?|bj|went down on|go(?:ing)? down on|eat(?:ing)? (?:her|him|me) out|ate (?:her|him|me) out|cunnilingus|fellatio|mamadas?|felacion|sexo oral|se la chupe|me la chupo|le hice oral|me hizo oral") },
  { kind: "position", value: "Lotus", re: r("lotus|flor de loto|loto|sitting face to face|face to face sitting|sentados frente a frente") },
];

// ---------------------------------------------------------------- contraception
export const METHOD_RULES: Rule[] = [
  // Emergency contraception is not "the pill": claim it so it maps to nothing.
  { kind: "block", value: "", prio: 9, re: r("plan b|morning after pill|day after pill|pastilla del dia despues|pildora del dia despues|pastilla de emergencia") },
  { kind: "method", value: "pullout", prio: 3, re: r("pull(?:ed|ing)? ?-?out|withdrawal|withdrew|came (?:outside|on (?:her|his|my) (?:stomach|belly|back|chest))|finished (?:outside|on (?:her|his) (?:stomach|belly|back|chest))|marcha atras|coito interrumpido|(?:me|lo|la) (?:saque|saco)|(?:termine|acabe|me vine|se vino|termino|acabo) (?:afuera|fuera)") },
  { kind: "method", value: "condom", re: r("condoms?|condon(?:es)?|rubbers?|preservativos?|condum") },
  { kind: "method", value: "pill", re: r("(?:the |birth control |contraceptive )?pills?(?! for)|pastillas? anticonceptivas?|anticonceptivos? orales|(?:la )?pastilla(?! para)|pastillas(?! para)|pildora") },
  { kind: "method", value: "iud", re: r("iud|diu|coil|mirena|kyleena|copper t|t de cobre|dispositivo intrauterino") },
  { kind: "method", value: "implant", re: r("implant|implante|nexplanon|implanon") },
  {
    kind: "method",
    value: "none",
    prio: 3,
    selfNeg: true,
    re: r("no protection|unprotected|without protection|used nothing|no birth control|no contraception|no method|nothing at all|sin proteccion|sin cuidarnos|sin nada|no usamos nada|nada de proteccion|ningun metodo|no nos cuidamos"),
  },
  // Slang that only says "no condom": claim it so it maps to nothing.
  { kind: "block", value: "", prio: 3, re: r("raw|bareback|a pelo") },
];

// ---------------------------------------------------------------- problems
export const PROBLEM_RULES: Rule[] = [
  { kind: "problem", value: "erection", prio: 2, selfNeg: true, re: r("couldn'?t get (?:it )?(?:hard|up)|could not get (?:it )?(?:hard|up)|lost (?:my|the|his) erection|went soft|got soft|wasn'?t (?:fully )?hard|no erection(?! (?:problems?|issues?|trouble))|no se me (?:paro|levanto|puso dura)|se me bajo|perdi la ereccion|no se le (?:paro|levanto)|couldn'?t (?:stay|keep it) hard|could not (?:stay|keep it) hard|couldn'?t keep (?:an|my|the|his) erection|no (?:pude|pudo) (?:mantener|tener) (?:la |una )?ereccion|se me (?:fue|cayo) la ereccion") },
  { kind: "problem", value: "erection", re: r("erections? (?:problems?|issues?|trouble|difficult(?:y|ies))|erectile|erection trouble|(?:difficult(?:y|ies)|trouble|problems?|issues?|a hard time|struggled?|struggling)(?: (?:to get|getting|to keep|keeping|with|to have|having|for))? (?:an |my |the |his |a )?(?:erection|it up|hard)|hard to (?:get|stay|keep it) hard|(?:problemas?|dificultad(?:es)?|fallas?|lios?)(?: (?:de|con|para|en))? (?:la |una |tener |lograr |mantener |tener una |mantener la )?(?:ereccion|erecto|parado)|(?:me|le) costo (?:tener |lograr |mantener )?(?:la |una )?(?:ereccion|que se me parara|que se le parara|pararse)|disfuncion erectil|ed") },
  { kind: "problem", value: "climax", prio: 2, selfNeg: true, re: r("couldn'?t (?:finish|come|cum|climax|orgasm)|could not (?:finish|come|climax)|didn'?t (?:finish|come|cum|climax)|did not (?:finish|come|climax)|never (?:finished|came)|not able to finish|no (?:orgasm|climax)|without (?:an )?orgasm|no (?:pude|pudo|pudimos) (?:terminar|acabar|venirme|venirse|llegar)|no (?:termine|acabe|llegue|me vine|se vino|termino|acabo|llego)|sin (?:orgasmo|terminar|acabar)|didn'?t (?:have|get|reach) (?:an |any |the |my |her |his )?(?:orgasm|climax)s?|(?:she|he|i) didn'?t (?:the (?:first|second|third|last) (?:time|round)|this time|that time)|(?:ella|el|yo) no (?:la (?:primera|segunda|tercera|ultima) vez|esa vez)|no (?:tuve|tuvo|tuvimos|alcance|alcanzo|logre|logro) (?:un |ningun |el |mi |su )?(?:orgasmo|climax)") },
  { kind: "problem", value: "climax", re: r("hard to (?:finish|climax|come)|cuesta terminar|(?:me|le) costo (?:terminar|acabar|venirme|venirse|llegar)") },
  { kind: "problem", value: "timing", re: r("(?:came|finished|cum|acabe|termine|me vine|se vino) (?:way |too |really |muy |super |demasiado )?(?:fast|quick(?:ly)?|early|soon|rapido|pronto)|too (?:soon|fast|quick)|premature(?:ly)?|eyaculacion precoz|precoz|muy pronto|demasiado rapido") },
  { kind: "problem", value: "pain", re: r("pain|painful|hurt|hurts|hurting|sore|soreness|discomfort|ouch|dolor(?:oso|osa)?|dolio|duele|dolia|molestias?|me molesto") },
  { kind: "problem", value: "dryness", prio: 2, selfNeg: true, re: r("not wet(?: enough)?|wasn'?t wet(?: enough)?|needed (?:more |some |extra )?lube|no estaba (?:mojada|lubricada)|poca lubricacion|falta de lubricacion") },
  { kind: "problem", value: "dryness", re: r("dryness|too dry|dry(?! humor| hump)|sequedad|resequedad|reseca|seca") },
  { kind: "problem", value: "fatigue", re: r("fatigue|tired|exhausted|worn out|drained|sleep deprived|cansancio|cansad[oa]s?|agotad[oa]s?|rendid[oa]s?") },
  { kind: "problem", value: "connection", prio: 2, selfNeg: true, re: r("weak connection|no connection(?! (?:problems?|issues?))|disconnected|felt distant|poca conexion|sin conexion|desconectad[oa]s?") },
  { kind: "problem", value: "connection", re: r("distant|distantes?") },
  { kind: "problem", value: "mood", re: r("bad mood|low mood|in a mood|grumpy|sad|upset|depressed|feeling down|felt down|was down|mal humor|de malas|mal animo|tristes?|bajon|deprimid[oa]s?|enojad[oa]s?") },
  { kind: "problem", value: "stress", re: r("stress|stressed|stressful|estres|estresad[oa]s?|estresante") },
  { kind: "problem", value: "distraction", re: r("distract(?:ed|ion|ing)?|on (?:my|her|his) phone|mind (?:was )?elsewhere|distraccion|distraid[oa]s?|la mente en otro lado") },
  { kind: "problem", value: "privacy", prio: 2, selfNeg: true, re: r("(?:no|little|not much|lack of|zero) privacy|privacy (?:issues?|problems?)|thin walls|could hear us|might hear us|(?:sin|poca|falta de|nada de) privacidad|paredes delgadas|nos (?:podian|iban a|pudieron) (?:oir|escuchar)") },
  { kind: "problem", value: "desire", prio: 2, selfNeg: true, re: r("low (?:desire|libido|sex drive)|no (?:desire|libido)(?! (?:problems?|issues?))|not in the mood|wasn'?t in the mood|didn'?t feel like it|poco deseo|bajo deseo|sin deseo|sin ganas|no tenia ganas|pocas ganas|libido baja|no estaba de humor|no estaba con ganas") },
  { kind: "problem", value: "period", re: r("period(?! of)|menstruat\\w*|menstruacion|menstruando|(?:la|su|mi) regla|con la regla|reglando|periodo(?! de)|en (?:sus|mis) dias|that time of the month") },
  { kind: "problem", value: "anxiety", re: r("anxiety|anxious|nervous|nerves|panic|ansiedad|ansios[oa]s?|nervios[oa]s?|nervios") },
  { kind: "problem", value: "alcohol", re: r("alcohol|drunk|tipsy|buzzed|wasted|hammered|(?:a few|some|couple(?: of)?|too many) drinks|drinking|drank|wine|beers?|tequila|vodka|whiskey|borrach[oa]s?|tomad[oa]s|tragos|copas|cervezas?|pasad[oa]s? de copas|ebri[oa]s?|(?:copas?|botella) de vino|vino (?:tinto|blanco)") },
  { kind: "problem", value: "medication", re: r("medications?|meds|medicine|antidepressants?|ssris?|viagra|cialis|sildenafil|medicacion|medicamentos?|medicina|antidepresivos?|pastillas para") },
  { kind: "problem", value: "interruption", re: r("interrupt\\w*|knock(?:ed|ing)? on the door|walked in on us|someone (?:came|walked) in|(?:kids?|baby) (?:woke|came in|knocked)|phone rang|interrump\\w*|interrupcion|tocaron (?:a )?la puerta|se desperto (?:el|la) (?:bebe|nino|nina)") },
  { kind: "problem", value: "bleeding", re: r("bleeding|bled|blood|spotting|sangr\\w*|manchado") },
  { kind: "problem", value: "irritation", re: r("irritat\\w*|burning(?! (?:desire|passion|need|want|lust|hunger|for))|burned(?! with)|burn(?! (?:with|for))|itch(?:y|ing)?|rash|chafing|irritacion|irritad[oa]s?|ardor|ardia|arde|picazon|comezon|escozor|rozadura|rozad[oa]s?") },
];

// ---------------------------------------------------------------- feelings (rating dims)
const INTENSIFIER = "(?:very|so|really|super|soo+|muy|bien|tan|re|demasiado|extremely|incredibly)";
const dim = (d: Rule["dim"], level: number, source: string, prio = 1): Rule => ({
  kind: "rating",
  dim: d,
  level,
  value: `${d}:${level}`,
  prio,
  re: r(source),
});

export const RATING_RULES: Rule[] = [
  // intensity: 1 Gentle · 2 Warm · 3 Passionate · 4 Electric · 5 Consuming
  dim("intensity", 5, "full (?:in |of )?intensity|full intensity|(?:max|maximum|top|pure|total) intensity|intensidad (?:maxima|total|plena|pura)|llen[oa] de intensidad|con toda la intensidad|consuming|lost track of time|perdimos (?:la nocion|la cuenta) del tiempo|absorbente|overwhelming|intensisimo|intensisima|insanely intense", 2),
  dim("intensity", 4, `${INTENSIFIER}? ?intens[oa]s?|${INTENSIFIER}? ?intense|electric|electrico|electrica|rough|urgent|aggressive|rudo|ruda`),
  dim("intensity", 4, "burning (?:desire|passion|lust)|deseo ardiente|ardiente deseo|pasion ardiente|(?:full of|so much|lots of|a lot of|strong|huge|intense|high|raw) (?:desire|lust|passion)|(?:mucho|tanto|un gran|gran|puro|intenso) deseo|llen[oa] de (?:deseo|pasion|ganas)|(?:con )?(?:muchas|tantas) ganas|so horny|super horny|really horny|muy cachond[oa]s?|bien cachond[oa]s?|bien arrech[oa]s?|muy arrech[oa]s?", 2),
  dim("intensity", 3, "horny|cachond[oa]s?|arrech[oa]s?|aroused|turned on|excitad[oa]s?|desire|deseo|lust|ganas|passionate|passion|steamy|heated|hot and heavy|hot(?! (?:shower|tub|water|bath|day|weather))|apasionad[oa]s?|con pasion|pasional|caliente(?!s? (?:la ducha|el agua))|calientes"),
  dim("intensity", 2, "warm|steady|calido|calida|constante"),
  dim("intensity", 1, "gentle|soft|slow|tender|suave|lento|lenta|despacio|despacito|tiern[oa]s?|delicad[oa]s?"),
  // connection: 1 Distant · 2 Sweet · 3 Close · 4 Soulful · 5 Profound
  dim("connection", 5, "profound|profoundly|felt like one|como uno solo|nothing else existed|no existia nada mas|soul connection|(?:amazing|incredible|insane|unreal) connection|conexion (?:increible|brutal|unica)|profundamente conectad[oa]s?", 3),
  dim("connection", 4, `deeply connected|${INTENSIFIER} (?:connected|close|conectad[oa]s?|cercan[oa]s?|unid[oa]s?)|soulful|intimate|intim[oa]s?|tuned in|great connection|mucha conexion`, 2),
  dim("connection", 3, "connected|conectad[oa]s?|close|cercan[oa]s?|eye contact|in sync|en sintonia|good connection|buena conexion"),
  dim("connection", 2, "sweet|cute|dulce|dulces"),
  dim("connection", 1, "distant|disconnected|felt far|distantes?|desconectad[oa]s?"),
  // satisfaction: 1 Light · 2 Pleasant · 3 Great · 4 Deep · 5 Unforgettable
  dim("satisfaction", 5, "(?:completely|totally|fully|so|super) satisfied|completamente satisfech[oa]s?|multiple orgasms|varios orgasmos|squirted", 2),
  dim("satisfaction", 4, `deeply satisfying|${INTENSIFIER} satisfied|(?:we )?both (?:came|finished)|los dos (?:terminamos|acabamos|llegamos)|ambos (?:terminamos|acabamos|llegamos)|(?:so much|lots of|a lot of) pleasure|mucho placer|muy satisfech[oa]s?`, 2),
  dim("satisfaction", 4, "(?:very|so|really|more|most|super|extremely|muy|bien|mas|super|tan) (?:pleasurable|placenter[oa]s?|enjoyable)|(?:intense|strong|huge|powerful|great|amazing|incredible|deep|big) orgasms?|orgasmos? (?:intensos?|fuertes?|brutal(?:es)?|increibles?|profundos?|riquisimos?)|came hard|(?:me|se) vino (?:rico|delicioso|fuerte)", 2),
  dim("satisfaction", 3, "pleasurable|placenter[oa]s?|enjoyable|disfrute|disfrutamos|disfruto|orgasms?|orgasmos?|climax(?:ed)?|orgasmed|(?:i|he|she|we) came|me vine|se vino|me corri|se corrio|llegue al (?:orgasmo|climax)|llego al (?:orgasmo|climax)|satisfied|satisfying|satisfech[oa]s?|satisfactori[oa]|really satisfying"),
  dim("satisfaction", 2, "pleasant|agradable|(?:some|a little) pleasure|poco placer|little pleasure|not much pleasure"),
  dim("satisfaction", 1, "unsatisfied|unsatisfying|not satisfied|insatisfech[oa]s?|me quede con ganas|left wanting more|frustrated"),
  // energy: 1 Languid · 2 Relaxed · 3 Playful · 4 High · 5 Wild
  dim("energy", 5, "wild|crazy|unstoppable|like animals|salvajes?|locos?|locas?|como animales|locura", 1),
  dim("energy", 4, "energetic|high energy|lots of energy|adventurous|bold|energic[oa]s?|mucha energia|atrevid[oa]s?|aventurer[oa]s?"),
  dim("energy", 3, "playful|fun|jugueton(?:a|es)?|juguetones|divertid[oa]s?"),
  dim("energy", 2, "relaxed|chill|calm|mellow|easy going|relajad[oa]s?|tranquil[oa]s?|calmad[oa]s?"),
  dim("energy", 1, "languid|sleepy|lazy|drowsy|half asleep|sonolient[oa]s?|perezos[oa]s?|medio dormid[oa]s?|con sueno"),
];

// Multiple orgasms: a rating, and it claims "twice" so it is not read as two sessions.
export const MULTI_RULES: Rule[] = [
  {
    kind: "multi",
    value: "satisfaction:5",
    dim: "satisfaction",
    level: 5,
    prio: 4,
    re: r("(?:came|cum|come|finished|orgasmed|climaxed|se vino|me vine|acabo|acabe|termino|termine|se corrio|me corri|llego|llegue)(?: like)? (?:twice|two times|three times|\\d+ times|dos veces|tres veces|\\d+ veces)"),
  },
];

// ---------------------------------------------------------------- overall (1–5)
const ov = (level: number, source: string, prio = 0): Rule => ({ kind: "overall", value: String(level), level, prio, re: r(source) });
export const OVERALL_RULES: Rule[] = [
  ov(2, "not great|not good|not the best|not (?:our|my|her|his|their) best|no fue (?:nuestro|nuestra|el|la|su) mejor(?: vez| noche)?|not amazing|not that good|no fue lo mejor|no tan buen[oa]|no muy buen[oa]|no estuvo tan bien|could have been better|pudo (?:ser|haber sido) mejor", 2),
  ov(3, "not bad|nada mal|no estuvo mal|no fue malo", 2),
  ov(5, "best (?:sex|night|time|session|one)? ?ever|best \\w+ of (?:my|her|his|our) li(?:fe|ves)|the best|amazing|amaizing|incredible|unbelievable|insane|mind ?-?blowing|unforgettable|perfect|out of this world|phenomenal|epic|spectacular|increible|espectacular|brutal|buenisim[oa]|riquisim[oa]|de lo mejor|lo mejor|lo maximo|fenomenal|inolvidable|perfect[oa]|la mejor|el mejor|10 de 10"),
  ov(4, "great|awesome|fantastic|wonderful|lovely|so good|really good|very good|super good|pretty good|good|nice|enjoyed it|loved it|really enjoyed|(?:muy|super|bien|que) ric[oa]|ric[oa]|muy buen[oa]|bien buen[oa]|super buen[oa]|muy bien|genial|delicios[oa]|sabros[oa]|chevere|chido|bacano|hermos[oa]|precios[oa]"),
  ov(3, "okay|ok|fine|decent|alright|average|estuvo bien|fue bien|todo bien|normal|aceptable"),
  ov(2, "meh|so-?so|so so|mediocre|regular|mas o menos|nada especial|nothing special|nada del otro mundo|flojo|meh+"),
  ov(1, "bad|terrible|awful|horrible|worst|disappointing|boring|disaster|mal[oa]|pesim[oa]|fatal|aburrid[oa]|decepcionante|desastre"),
];

// ---------------------------------------------------------------- negation
export const NEGATORS = new Set([
  "no", "not", "never", "without", "didnt", "didn't", "dont", "don't", "doesnt", "doesn't", "wasnt", "wasn't",
  "werent", "weren't", "isnt", "isn't", "arent", "aren't", "hadnt", "hadn't", "havent", "haven't", "couldnt", "couldn't",
  "nor", "neither", "zero", "w/o", "sin", "nunca", "ni", "tampoco", "ningun", "ninguna", "ninguno", "nada", "forgot",
  "olvidamos", "olvide", "olvido", "skipped", "skip",
]);
/** Phrases that look negative but are not ("never felt so close"). Removed before the negation check. */
export const NOT_NEGATION = [
  /\bnever (?:felt|been|had|seen|was|were) (?:so|this|that|such)\b/g,
  /\bnunca (?:me )?(?:habia|he|habiamos|hemos) (?:sentido|estado|tenido) (?:tan|asi)\b/g,
  /\bnot only\b|\bno solo\b|\bno wonder\b|\bno doubt\b|\bsin duda\b|\bcouldn'?t be (?:happier|better)\b/g,
];
export const INSTEAD = /\b(?:instead of|en vez de|en lugar de)\s*$/;
/** Words that end a negation's reach. */
export const SCOPE_BREAK = /\b(?:and|but|then|so|because|though|although|pero|y|e|luego|aunque|porque|entonces|despues|after|while|mientras)\b/g;

// ---------------------------------------------------------------- notes
/** Words that carry no story on their own; a clause made only of these plus detected bits is dropped from the note. */
export const FILLER = new Set(
  (
    "and y e then luego despues with con w used use using usamos uso we i me she he her him it its a an the el la los las un una unos unas " +
    "de del en in at on around about approx approximately like como por para did do done hicimos hice hizo was were fue fueron estuvo " +
    "very so really super muy bien pretty just solo also too tambien for of to al lo le se nos our my mi su sus time times vez veces " +
    "honestly verdad position positions posicion posiciones style sex sexo rated rate us kind quite bit little poco this that ese esa este esta " +
    "then had have tuvimos tenemos is are be been some each cada one ones round rounds ronda rondas session sessions sesion sesiones again " +
    "said dijo says she's he's it's we're was out up both ambos las los des que ya after before antes ella el yo nosotros tipo eso cerca " +
    "night morning afternoon evening noche manana tarde madrugada today yesterday hoy ayer last anoche minutes minutos min mins hour hours hora horas " +
    "x th st nd rd am pm h hrs just only con without sin no not energy energia vibe vibes connection conexion intensity intensidad " +
    "satisfaction satisfaccion pleasure placer overall general rating calificacion puntuacion puntaje score stars estrellas"
  ).split(/\s+/),
);

// ---------------------------------------------------------------- fuzzy vocabulary
/** Single words (folded) that may be matched with one typo. Real words that sit one letter away are listed in FUZZY_STOP. */
export const FUZZY_WORDS: { word: string; kind: Rule["kind"]; value: string; dim?: Rule["dim"]; level?: number }[] = [
  { word: "missionary", kind: "position", value: "Missionary" },
  { word: "misionero", kind: "position", value: "Missionary" },
  { word: "cowgirl", kind: "position", value: "Cowgirl" },
  { word: "spooning", kind: "position", value: "Spooning" },
  { word: "cucharita", kind: "position", value: "Spooning" },
  { word: "perrito", kind: "position", value: "Doggy" },
  { word: "vaquera", kind: "position", value: "Cowgirl" },
  { word: "standing", kind: "position", value: "Standing" },
  { word: "condom", kind: "method", value: "condom" },
  { word: "condoms", kind: "method", value: "condom" },
  { word: "condones", kind: "method", value: "condom" },
  { word: "bedroom", kind: "place", value: "Bedroom" },
  { word: "shower", kind: "place", value: "Shower" },
  { word: "office", kind: "place", value: "Office" },
  { word: "oficina", kind: "place", value: "Office" },
  { word: "painful", kind: "problem", value: "pain" },
  { word: "exhausted", kind: "problem", value: "fatigue" },
  { word: "stressed", kind: "problem", value: "stress" },
  { word: "estresado", kind: "problem", value: "stress" },
  { word: "distracted", kind: "problem", value: "distraction" },
  { word: "interrupted", kind: "problem", value: "interruption" },
  { word: "irritation", kind: "problem", value: "irritation" },
  { word: "bleeding", kind: "problem", value: "bleeding" },
  { word: "anxiety", kind: "problem", value: "anxiety" },
  { word: "ansiedad", kind: "problem", value: "anxiety" },
  { word: "amazing", kind: "overall", value: "5", level: 5 },
  { word: "incredible", kind: "overall", value: "5", level: 5 },
  { word: "increible", kind: "overall", value: "5", level: 5 },
  { word: "espectacular", kind: "overall", value: "5", level: 5 },
  { word: "delicioso", kind: "overall", value: "4", level: 4 },
  { word: "passionate", kind: "rating", value: "intensity:3", dim: "intensity", level: 3 },
  { word: "apasionado", kind: "rating", value: "intensity:3", dim: "intensity", level: 3 },
  { word: "connected", kind: "rating", value: "connection:3", dim: "connection", level: 3 },
  { word: "conectados", kind: "rating", value: "connection:3", dim: "connection", level: 3 },
  { word: "satisfied", kind: "rating", value: "satisfaction:3", dim: "satisfaction", level: 3 },
  { word: "satisfechos", kind: "rating", value: "satisfaction:3", dim: "satisfaction", level: 3 },
];
export const FUZZY_STOP = new Set([
  "showed", "slower", "shower", "condos", "condor", "offices", "officer", "standings", "connecter", "collected", "corrected",
  "misionera", "perrita", "vaqueros", "vaquero", "ansiedades", "amazingly", "satisfies", "painted", "bleeping", "breeding",
  "stresses", "stretched", "anxiety", "distract", "officina",
]);

// ---------------------------------------------------------------- dates
export const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  // "set" (Spanish "set." / "21 set") is only read as September where batch.ts says so.
  sep: 9, sept: 9, set: 9, september: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

export const WEEKDAYS: Record<string, number> = {
  sunday: 0, domingo: 0,
  monday: 1, lunes: 1,
  tuesday: 2, martes: 2,
  wednesday: 3, miercoles: 3,
  thursday: 4, jueves: 4,
  friday: 5, viernes: 5,
  saturday: 6, sabado: 6,
};

export const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, "forty five": 45, sixty: 60, ninety: 90,
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, "cuarenta y cinco": 45, sesenta: 60, noventa: 90,
  a: 1, an: 1, couple: 2, "a couple": 2, "a couple of": 2, par: 2, "un par de": 2,
};
