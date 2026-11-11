# Vendored dependencies

## SheetJS Community Edition 0.20.3

| | |
|---|---|
| File | `vendor/xlsx-0.20.3.tgz` (2,409,319 bytes) |
| SHA-256 | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` (also in `CHECKSUMS.txt`) |
| npm integrity (package-lock) | `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==` |
| Source | Downloaded by the project owner from the official SheetJS CDN (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) and committed on 10 November 2026 |
| Version | 0.20.3 (`package.json`, `XLSX.version`, CHANGELOG) |
| License | Apache License 2.0 (`LICENSE` inside the package) |
| Installed as | `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` in `package.json` |
| Not used | `@e965/xlsx` (third-party republish) |

### Verification performed

| Check | Result |
|---|---|
| SHA-256 recorded and pinned (CHECKSUMS.txt plus the package-lock integrity hash) | ✅ |
| Compared with an independent official copy | ✅ **Match.** On 11 November 2026 the project owner made a fresh download of `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` on their Android device and computed its SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`, identical to the vendored file. (It can't be done from the development environment, where SheetJS's servers are blocked.) |
| `package.json` name `xlsx`, version 0.20.3, license Apache-2.0, no runtime dependencies | ✅ |
| CHANGELOG lists the CVE-2023-30533 fix (0.19.3) and the CVE-2024-22363 fix (0.20.2) | ✅ |
| No install hooks (`preinstall`/`install`/`postinstall`) | ✅ |
| Browser build (`xlsx.mjs`) contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval(`, `new Function` or `child_process` | ✅ |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Behavioural tests: prototype-pollution names and pathological XML (regression guards for both CVE classes) | ✅ (`tests/engine/excel.test.ts`) |

To re-verify at any time, download the same URL again and compare its SHA-256 with the value above.

### Known issue in this version

SheetJS 0.20.3 decodes XML numeric character references above U+FFFF with `String.fromCharCode`, so `&#128512;` (😀) becomes U+F600. Excel writes raw UTF-8 and is not affected. openpyxl (and pandas, which uses it) writes every non-ASCII character as a numeric reference. DataFixer works around this without modifying the package: see `src/engine/xlsx/inspect.ts` (`astralRefs`) and `read-workbook.ts`.

### Updating

Download a newer official release, add it here, update `CHECKSUMS.txt`, run `npm install ./vendor/xlsx-<version>.tgz`, delete the old file, and run the full test suite.
