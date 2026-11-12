/**
 * Show invisible characters in a line from a CSV file: line breaks ↵ (CRLF
 * counts as one), lone CR ␍, tab ⇥, other control characters as their Unicode
 * "control picture" (NUL → ␀), DEL ␡, and U+0080–U+009F as ▯, so nothing in
 * the line is hidden. No dependencies: safe to use on the page.
 */
export function visibleRaw(text: string): string {
  return text
    .replace(/\r\n|\n/g, "↵")
    .replace(/\r/g, "␍")
    .replace(/\t/g, "⇥")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, (c) => String.fromCharCode(0x2400 + c.charCodeAt(0)))
    .replace(/\u007f/g, "␡")
    .replace(/[\u0080-\u009f]/g, "▯");
}
