/**
 * Stage 9: Change case (owner decisions 1A–5A, 23 November 2026).
 *
 * Styles: Proper Case, UPPER CASE, lower case. Proper Case uses name rules (decision 4A):
 * - the first letter of every word, and of every part after a hyphen, full stop, slash, bracket
 *   or similar, becomes a capital; the other letters become small ("ravi k" → "Ravi K");
 * - after an apostrophe only when one letter comes before it ("o'brien" → "O'Brien",
 *   "d'souza" → "D'Souza", but "don't" → "Don't");
 * - "Mc" names ("mcdonald" → "McDonald");
 * - small linking words in the middle of a name stay small (van, von, der, den, de, da, del,
 *   di, du, la, bin, al, of, and, the): "ludwig VAN beethoven" → "Ludwig van Beethoven",
 *   "state bank of india" → "State Bank of India";
 * - Roman numerals II–XXXIX after the first word become capitals ("henry viii" → "Henry VIII");
 * - short ALL-CAPITAL words (2–5 letters) are kept when the same value also has a word written
 *   the normal way, so "HDFC Bank" stays; "MEERA s" has no such word and becomes "Meera S".
 *
 * Never changed, whatever the style: email addresses, web addresses and values containing
 * digits (codes such as MH12AB1234). Formula cells, empty cells and column names are protected
 * by the fix itself.
 */

export type CaseStyle = "proper" | "upper" | "lower";

export const CASE_STYLE_LABELS: Record<CaseStyle, string> = {
  proper: "Proper Case",
  upper: "UPPER CASE",
  lower: "lower case",
};

export const CASE_SKIP_REASONS = {
  email: "Email addresses are never changed.",
  url: "Web addresses are never changed.",
  digits: "Values that contain numbers (such as codes) are never changed.",
} as const;
export type CaseSkip = keyof typeof CASE_SKIP_REASONS;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_LIKE = /^(?:https?:\/\/|www\.)\S+$|^[^\s@/]+\.(?:com|org|net|in|co|io|gov|edu|info|biz)(?:\/\S*)?$/i;
const DIGIT = /\p{Nd}/u;
const LETTER = /\p{L}/u;
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const APOSTROPHES = new Set(["'", "’"]);
const PARTICLES = new Set(["van", "von", "der", "den", "de", "da", "del", "di", "du", "la", "bin", "al", "of", "and", "the"]);
/** Roman numerals II–XXXIX (single letters such as “v” are treated as initials). */
const ROMAN = /^(?=.{2})x{0,3}(?:ix|iv|v?i{0,3})$/;

/** Why a value is never changed, or null if it may be. */
export function caseSkipReason(value: string): CaseSkip | null {
  const v = value.trim();
  if (EMAIL.test(v)) return "email";
  if (URL_LIKE.test(v)) return "url";
  if (DIGIT.test(v)) return "digits";
  return null;
}

/** A word written the normal way: a capital followed only by small letters ("Bank", "Pune"). */
function isNormalWord(word: string): boolean {
  const letters = [...word].filter((c) => LETTER.test(c));
  return letters.length >= 2 && UPPER.test(letters[0]!) && letters.slice(1).every((c) => LOWER.test(c));
}

/** A short all-capital word such as HDFC or NASA (2–5 letters, nothing else). */
function isShortCapitals(word: string): boolean {
  return /^\p{Lu}{2,5}$/u.test(word);
}

/** Proper Case for one word that isn't a particle, numeral or kept short form. */
function properWord(word: string): string {
  const lower = word.toLowerCase();
  let out = "";
  let capNext = true;
  let lettersInPart = 0;
  for (const c of lower) {
    if (LETTER.test(c)) {
      out += capNext ? c.toUpperCase() : c;
      capNext = false;
      lettersInPart++;
    } else {
      out += c;
      capNext = APOSTROPHES.has(c) ? lettersInPart === 1 : true;
      lettersInPart = 0;
    }
  }
  // "Mcdonald" → "McDonald" (only when a letter follows "Mc").
  return out.replace(/^Mc(\p{Ll})/u, (_, l: string) => `Mc${l.toUpperCase()}`);
}

function toProper(value: string): string {
  const parts = value.split(/(\s+)/);
  const words = parts.filter((p, i) => i % 2 === 0 && p !== "");
  const keepShortCapitals = words.some(isNormalWord);
  let wordIndex = -1;
  return parts
    .map((p, i) => {
      if (i % 2 === 1 || p === "") return p;
      wordIndex++;
      const lower = p.toLowerCase();
      if (keepShortCapitals && isShortCapitals(p)) return p;
      if (wordIndex > 0 && PARTICLES.has(lower)) return lower;
      if (wordIndex > 0 && ROMAN.test(lower)) return p.toUpperCase();
      return properWord(p);
    })
    .join("");
}

/**
 * The value in the chosen style. Returns the value unchanged (same string) when it is already in
 * that style or has no letters, and a skip reason for values that are never changed.
 */
export function changeCase(value: string, style: CaseStyle): { value: string } | { skip: CaseSkip } {
  if (!LETTER.test(value)) return { value };
  const skip = caseSkipReason(value);
  if (skip) return { skip };
  if (style === "upper") return { value: value.toUpperCase() };
  if (style === "lower") return { value: value.toLowerCase() };
  return { value: toProper(value) };
}
