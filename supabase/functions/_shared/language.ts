// Which languages a piece of label text is written in, for the EU
// language rules (e.g. German in Germany, French in France). A small,
// deterministic word-list detector: label text is short, so it counts
// common function words and label vocabulary per language rather than
// using a statistical model. Pure TypeScript (Deno and vitest).

export type LabelLanguage = "en" | "de" | "fr";

const WORDS: Record<LabelLanguage, string[]> = {
  en: [
    "the", "and", "with", "for", "use", "avoid", "contact", "eyes", "keep", "out", "reach", "children", "apply",
    "skin", "hair", "only", "external", "rinse", "if", "irritation", "occurs", "store", "after", "opening",
    "best", "before", "cream", "face", "hands", "body", "of", "to", "in", "on", "not", "do", "wash",
  ],
  de: [
    "und", "mit", "für", "der", "die", "das", "nicht", "augen", "kontakt", "vermeiden", "kindern", "unzugänglich",
    "aufbewahren", "haut", "haare", "auftragen", "anwendung", "nur", "äußerlich", "bei", "reizung", "ausspülen",
    "nach", "dem", "öffnen", "mindestens", "haltbar", "bis", "creme", "gesicht", "hände", "körper", "von", "zur",
    "ist", "sie", "vor", "enthält", "gründlich", "waschen",
  ],
  fr: [
    "et", "avec", "pour", "le", "la", "les", "des", "du", "ne", "pas", "yeux", "contact", "éviter", "enfants",
    "portée", "hors", "conserver", "peau", "cheveux", "appliquer", "usage", "externe", "uniquement", "en", "cas",
    "irritation", "rincer", "après", "ouverture", "utiliser", "avant", "crème", "visage", "mains", "corps", "de",
    "contient", "abondamment", "tenir",
  ],
};

// Letters that only one of the three uses.
const LETTERS: Record<LabelLanguage, RegExp> = {
  en: /$^/, // English has none
  de: /[äöüß]/gi,
  fr: /[éèêàçëîïôûœ]/gi,
};

// Words shared by several languages carry no signal.
const SHARED = new Set(
  Object.values(WORDS)
    .flat()
    .filter((w, i, all) => all.indexOf(w) !== i)
);

export const detectLanguages = (text: string, minHits = 2): LabelLanguage[] => {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const scores = {} as Record<LabelLanguage, number>;
  for (const lang of Object.keys(WORDS) as LabelLanguage[]) {
    const vocab = new Set(WORDS[lang].filter((w) => !SHARED.has(w)));
    scores[lang] = words.filter((w) => vocab.has(w)).length + Math.min(2, (text.match(LETTERS[lang]) ?? []).length);
  }
  return (Object.keys(scores) as LabelLanguage[]).filter((l) => scores[l] >= minHits);
};

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", de: "German", fr: "French" };
