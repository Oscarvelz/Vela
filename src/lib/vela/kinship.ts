/* One vocabulary for both readers (Round 4): the pregnancy reader
 * and the batch reader claimed to share a kinship vocabulary and
 * kept two — each list stopped somewhere the other didn't, and every
 * gap filed somebody else's news as the owner's own (RT4-H2 P4-1,
 * B4-1). The determiners, relations, animals, titles and correction
 * markers live HERE now; a reader that needs a word adds it once,
 * for both. All entries are written against fold()ed text: lowercase,
 * accents stripped, straight apostrophes. */

/* Possessives and articles that can govern a relation. Round 4
 * (P4-1): the first-person plurals — "our daughter", "nuestra
 * hija", the most natural way to write about one's own children —
 * were missing in both readers. */
export const DETERMINERS_SRC =
  "her|his|my|their|our|mi|mis|su|sus|nuestro|nuestra|nuestros|nuestras|la|el|una|un|the";

/* The relation vocabulary. "Wife" and "husband" are deliberately
 * absent: in the owner's own journal the wife is the subject
 * herself, and her declarations must not die as somebody else's
 * news. Round 4 (P4-2): the blended family joins — step- and half-
 * relations and god-relations are somebody else too. */
export const RELATIONS_SRC = [
  "sister", "brother", "mother", "father", "aunt", "uncle", "cousin", "daughter", "son", "niece", "nephew",
  "grandmother", "grandfather", "grandma", "grandpa", "friend", "roommate", "coworker", "colleague", "neighbor", "neighbour", "boss",
  "stepsister", "stepbrother", "stepmother", "stepfather", "stepdaughter", "stepson",
  "half sister", "half brother", "half-sister", "half-brother",
  "godmother", "godfather", "goddaughter", "godson",
  "hermana", "hermano", "madre", "padre", "tia", "tio", "prima", "primo", "hija", "hijo", "sobrina", "sobrino",
  "cunada", "cunado", "suegra", "suegro", "nuera", "yerno", "nieta", "nieto", "abuela", "abuelo",
  "amiga", "amigo", "vecina", "vecino", "companera", "companero",
  "hermanastra", "hermanastro", "madrastra", "padrastro", "hijastra", "hijastro", "madrina", "padrino", "ahijada", "ahijado",
].join("|");

/* Single-token relations, for the name witness's common-subject set. */
export const RELATION_WORDS = RELATIONS_SRC.split("|").filter((w) => !/[\s-]/.test(w));

/* The TITLE forms of the relations — the words actually used as
 * names ("Mom is pregnant", "Auntie is pregnant", "Nana is
 * pregnant"). At the start of a sentence the capital witness cannot
 * tell them from a person's name, so they are common subjects too
 * (Round 4, P4-3). */
export const TITLES = ["mom", "mum", "mama", "dad", "papa", "auntie", "aunty", "nana", "pop", "pops"];

/* Animals: a cow is not a named person and "la perra" is not the
 * partner. */
export const ANIMALS = [
  "dog", "cat", "cow", "horse", "goat", "pig", "sheep",
  "perro", "perra", "gato", "gata", "vaca", "caballo", "yegua", "cabra", "oveja", "cerdo", "cerda", "burro", "burra",
];

/* Correction markers — the words that take a statement back. One
 * inventory for both readers (Round 4, P4-7/B4-3): pregnancy heard
 * "digo" but not "en realidad"; batch heard "en realidad" but not
 * "digo"; neither heard "sorry". */
export const CORRECTION_SRC = "no wait|i mean|wait|actually|en realidad|sorry|lo siento|mejor dicho|digo|correction|perdon";
