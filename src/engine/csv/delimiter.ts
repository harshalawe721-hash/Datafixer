/**
 * Delimiter detection. Papa Parse's built-in guess can fail on very small
 * files and silently fall back to a comma (verified: "a;b\n1;2\n" was read as
 * one column), so we choose the delimiter ourselves from a text sample.
 *
 * For each candidate we parse up to 100 rows and prefer the candidate whose
 * rows most consistently share the same field count (> 1), then more fields.
 */
import Papa from "papaparse";

export const DELIMITER_CANDIDATES = [",", ";", "\t", "|"] as const;

export interface DelimiterGuess {
  delimiter: string;
  /** False when no candidate produced consistent multi-column rows. */
  confident: boolean;
  /** True when every candidate yields a single column. */
  singleColumn: boolean;
}

export function detectDelimiter(sample: string, sampleIsWholeFile: boolean): DelimiterGuess {
  let text = sample.length > 65536 ? sample.slice(0, 65536) : sample;
  let truncated = !sampleIsWholeFile || text.length < sample.length;
  if (truncated) {
    const cut = Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r"));
    if (cut > 0) text = text.slice(0, cut);
    else truncated = false; // a single long line: use as-is
  }

  let best: { delimiter: string; score: number; consistency: number; fields: number } | null = null;
  for (const delimiter of DELIMITER_CANDIDATES) {
    const res = Papa.parse<string[]>(text, { delimiter, preview: 100, skipEmptyLines: true, quoteChar: '"' });
    const counts = res.data.map((r) => r.length);
    if (counts.length === 0) continue;
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    let mode = 0;
    let modeFreq = 0;
    for (const [c, f] of freq) if (f > modeFreq || (f === modeFreq && c > mode)) [mode, modeFreq] = [c, f];
    if (mode < 2) continue;
    const consistency = modeFreq / counts.length;
    const score = consistency * 1000 + Math.min(mode, 500);
    if (!best || score > best.score) best = { delimiter, score, consistency, fields: mode };
  }
  if (!best) return { delimiter: ",", confident: true, singleColumn: true };
  return { delimiter: best.delimiter, confident: best.consistency >= 0.8, singleColumn: false };
}
