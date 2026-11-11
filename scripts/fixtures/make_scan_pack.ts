/**
 * Builds the Stage 3 Error Detector test pack (tablet/manual testing) with
 * planted problems and their expected counts.
 *
 * Usage: node scripts/fixtures/make_scan_pack.ts OUT_DIR [--large]
 *  - 1-problems.csv / problems.json (rows with types, for the XLSX builder)
 *  - 3-clean.csv
 *  - with --large: 4-large-problems-25mb.csv, 5-large-problems-50mb.csv
 *  - expected.json: planted counts per check, per file
 * The large files' expected counts come from the generator itself (it counts
 * what it plants), not from DataFixer.
 */
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2] ?? "scan-pack";
const LARGE = process.argv.includes("--large");
mkdirSync(OUT, { recursive: true });

type Cell = string | number | null | { formula: string } | { date: string };
const pad2 = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- small file
const HEADER = ["id", "name", "email", "phone", "city", "amount", "joined", "notes"];
const CITIES = ["Paris", "London", "Berlin", "Madrid"];

function baseRow(i: number): Cell[] {
  return [
    i,
    `Person ${i}`,
    `person${i}@example.com`,
    `+1 555 01${pad2(i)} 0000`,
    CITIES[(i - 1) % 4]!,
    100 + ((i * 13) % 200),
    { date: `2024-01-${pad2(i)}` },
    null,
  ];
}

const rows: Cell[][] = [];
for (let i = 1; i <= 24; i++) {
  const r = baseRow(i);
  if (i === 3) r[1] = " Person 3"; // extra space
  if (i === 5) r[4] = "paris"; // capitalization
  if (i === 7) r[2] = "person7example.com"; // invalid email (no @)
  if (i === 8) r[2] = "person8@example"; // invalid email (no domain ending)
  if (i === 9) r[3] = "N/A"; // invalid phone
  if (i === 10) r[3] = "(555) 010-1000"; // valid phone, different layout (note)
  if (i === 11) r[5] = "1,250"; // number with formatting among plain numbers
  if (i === 12) r[5] = 99999; // unusual value
  if (i === 13) r[5] = { formula: "1/0" }; // formula error (#DIV/0!)
  if (i === 14) r[6] = "31/01/2024"; // date in another format
  if (i === 15) r[6] = "2024-02-30"; // impossible date
  if (i === 16) r[2] = null; // missing cell
  if (i === 18) r[4] = "London "; // extra space
  rows.push(r);
}
rows.push(HEADER.map(() => null)); // empty row
rows.push(baseRow(1), baseRow(2)); // 2 duplicate rows (copies of rows 1 and 2)

const csvValue = (c: Cell): string => {
  if (c === null) return "";
  if (typeof c === "number") return String(c);
  if (typeof c === "string") return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
  if ("formula" in c) return "#DIV/0!"; // what Excel exports for =1/0
  return c.date;
};
writeFileSync(path.join(OUT, "1-problems.csv"), [HEADER.join(","), ...rows.map((r) => r.map(csvValue).join(","))].join("\n") + "\n");
writeFileSync(path.join(OUT, "problems.json"), JSON.stringify({ header: HEADER, rows }));

const expected: Record<string, Record<string, number>> = {
  "1-problems.csv": {
    "duplicate-rows": 2,
    "empty-rows": 1,
    "empty-columns": 1,
    "missing-cells": 1,
    "extra-spaces": 2,
    "inconsistent-case": 1,
    "numbers-as-text": 1,
    "inconsistent-dates": 1,
    "impossible-dates": 1,
    "invalid-emails": 2,
    "invalid-phones": 1,
    "phone-formats": 1,
    "unusual-values": 1,
    "formula-errors": 1,
  },
  "2-problems.xlsx": {
    "duplicate-rows": 2,
    "empty-rows": 1,
    "empty-columns": 1,
    "missing-cells": 1,
    "extra-spaces": 2,
    "inconsistent-case": 1,
    "numbers-as-text": 1, // "250" stored as text among real numbers
    "inconsistent-dates": 2, // both text dates differ from the real Excel dates
    "impossible-dates": 1,
    "invalid-emails": 2,
    "invalid-phones": 1,
    "phone-formats": 1,
    "unusual-values": 1,
    "formula-errors": 1,
  },
  "3-clean.csv": {},
};

// ---------------------------------------------------------------- clean file
{
  const lines = ["id,name,email,city,amount,joined"];
  for (let i = 1; i <= 30; i++) lines.push(`${i},Person ${i},person${i}@example.com,${CITIES[(i - 1) % 4]},${100 + ((i * 13) % 200)},2024-02-${pad2(((i - 1) % 28) + 1)}`);
  writeFileSync(path.join(OUT, "3-clean.csv"), lines.join("\n") + "\n");
}

// ---------------------------------------------------------------- large files
function writeLarge(name: string, targetBytes: number) {
  const fd = openSync(path.join(OUT, name), "w");
  const cities = ["Paris", "London", "Berlin", "Madrid", "Rome"];
  const counts = { "duplicate-rows": 0, "invalid-emails": 0, "missing-cells": 0, "inconsistent-case": 0, "extra-spaces": 0, "unusual-values": 0 };
  let written = writeSync(fd, "id,name,email,city,amount,joined\n");
  let prev = "";
  let buf: string[] = [];
  for (let k = 1; written < targetBytes; k++) {
    let line: string;
    if (k % 100 === 0) {
      line = prev; // exact copy of the previous row (never itself a planted row)
      counts["duplicate-rows"]++;
    } else {
      let name = `Customer ${k}`;
      let email = `user${k}@example.com`;
      let city = cities[k % 5]!;
      let amount = String(100 + ((k * 37) % 900));
      if (k % 250 === 7) { email = `user${k}example.com`; counts["invalid-emails"]++; }
      if (k % 400 === 13) { amount = ""; counts["missing-cells"]++; }
      if (k % 700 === 21) { city = "paris"; counts["inconsistent-case"]++; }
      if (k % 900 === 33) { name = `${name} `; counts["extra-spaces"]++; }
      if (k % 10000 === 5001) { amount = "9999999"; counts["unusual-values"]++; }
      line = `${k},${name},${email},${city},${amount},2024-${pad2((k % 12) + 1)}-${pad2((k % 28) + 1)}\n`;
    }
    prev = line;
    buf.push(line);
    if (buf.length >= 5000) {
      written += writeSync(fd, buf.join(""));
      buf = [];
    }
  }
  if (buf.length) writeSync(fd, buf.join(""));
  closeSync(fd);
  // A "paris" variant only counts if "Paris" also appears (it always does here).
  expected[name] = counts;
}
if (LARGE) {
  writeLarge("4-large-problems-25mb.csv", 25 * 1024 * 1024);
  writeLarge("5-large-problems-50mb.csv", 50 * 1024 * 1024);
}

writeFileSync(path.join(OUT, "expected.json"), JSON.stringify(expected, null, 2));
console.log(JSON.stringify(expected, null, 2));
