"""Stage 5 test pack for the CSV Validator: one file per problem, plus a clean file.

Every problem is planted at known positions, so the expected counts
(tests/fixtures/validate/expected.json) are exact. Files are written as raw
bytes so line endings, BOMs and invalid bytes are exactly as described.
Run: python3 scripts/fixtures/make_validate_pack.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "validate"
OUT.mkdir(parents=True, exist_ok=True)

FIRST = ["Asha", "Ben", "Chen", "Dara", "Eli", "Fatima", "Gus", "Hana", "Ivan", "Jo"]
CITY = ["Pune", "Leeds", "Lyon", "Oslo", "Lima"]


def person(i):
    return [str(1000 + i), FIRST[i % 10], f"{FIRST[i % 10].lower()}{i}@example.com", CITY[i % 5]]


def write(name, data: bytes):
    (OUT / name).write_bytes(data)


def lines(rows, sep=",", eol="\r\n", final=True):
    text = eol.join(sep.join(r) for r in rows)
    return text + (eol if final else "")


HEADER = ["id", "name", "email", "city"]

# 0: clean. Header + 30 rows, CRLF, final line break, UTF-8 without BOM.
write("0-clean.csv", lines([HEADER] + [person(i) for i in range(30)]).encode())

# 1: uneven rows. 40 data rows; rows 6, 13, 27 (file rows, 1-based) are short (3 fields),
# rows 20 and 33 are long: an extra value (5 fields) and an unquoted comma in a value (6 fields).
rows = [HEADER] + [person(i) for i in range(40)]
for r in (5, 12, 26):
    rows[r] = rows[r][:3]
rows[19] = rows[19] + ["extra"]
rows[32] = rows[32][:2] + ["Smith, J", "x@example.com", "Rome"]  # unquoted comma inside a value
write("1-uneven.csv", lines(rows).encode())

# 2: header problems. Empty name (C), duplicate (D "Email" vs E "email "),
# spaces (E "email ", F " phone"), a very long name (G, 120 chars).
long_name = ("Customer reference number as recorded by the regional office " + "x" * 120)[:120]
assert len(long_name) == 120
hdr = ["id", "name", "", "Email", "email ", " phone", long_name]
rows = [hdr] + [person(i)[:2] + ["n/a", person(i)[2], person(i)[2], f"0700{i:06d}", f"R{i}"] for i in range(20)]
write("2-header.csv", lines(rows).encode())

# 3: quotes. Stray quotes in 2 rows (unquoted values containing "), 3 values with
# line breaks inside quotes (valid), everything else clean.
body = [",".join(HEADER)]
for i in range(25):
    p = person(i)
    if i == 4:
        p[1] = 'Ana "the boss" Ruiz'
    if i == 15:
        p[3] = 'Paris 5"'
    if i in (7, 8, 20):
        p[3] = f'"Flat {i}\nMain Street"'
    body.append(",".join(p))
write("3-quotes.csv", ("\r\n".join(body) + "\r\n").encode())

# 3b: a quote that never closes (starts on file row 11), so the rest is one value.
body = [",".join(HEADER)] + [",".join(person(i)) for i in range(20)]
body[10] = "1009,Jo,jo9@example.com,\"Lima"
write("3b-unclosed.csv", ("\r\n".join(body) + "\r\n").encode())

# 4: encoding. Valid UTF-8 for the first ~70 KB (so detection says UTF-8), then one row
# with two invalid bytes (0xFF, 0xE9 alone) in two different cells.
rows = [",".join(HEADER).encode()]
i = 0
while sum(len(r) + 2 for r in rows) < 70_000:
    rows.append(",".join(person(i)).encode())
    i += 1
bad_index = len(rows)  # 0-based file row
rows.append(b"9999,Ren\xe9e,renee@example.com,S\xffo Paulo")
for j in range(5):
    rows.append(",".join(person(i + j)).encode())
write("4-encoding.csv", b"\r\n".join(rows) + b"\r\n")
ENCODING_BAD_ROW = bad_index

# 5: line endings. Mixed CRLF/LF, 3 blank lines, no final line break.
rows = [",".join(HEADER)] + [",".join(person(i)) for i in range(20)]
text = ""
for k, r in enumerate(rows):
    text += r
    if k < len(rows) - 1:
        text += "\n" if k % 3 == 0 else "\r\n"
        if k in (5, 9, 14):
            text += "\r\n"  # blank line
write("5-line-endings.csv", text.encode())

# 5b: old Mac line endings (CR only).
write("5b-cr.csv", lines([HEADER] + [person(i) for i in range(10)], eol="\r").encode())

# 6: hidden characters and formula-like values.
rows = [HEADER] + [person(i) for i in range(20)]
rows[3][1] = "Ben\x00"          # NUL
rows[8][3] = "Le\x00eds"        # NUL
rows[12][1] = "Gus\x07"         # bell
rows[5][3] = "=1+1"
rows[10][3] = "+cmd"
rows[14][3] = "@SUM(A1)"
rows[16][3] = "-2+3"
rows[18][3] = "-5"              # plain number: not formula-like
write("6-control.csv", lines(rows).encode())

# 7: every line ends with an extra separator (empty last column, empty header name).
write("7-trailing.csv", lines([r + [""] for r in [HEADER] + [person(i) for i in range(15)]]).encode())

# 8: Excel "sep=" hint line, semicolon-separated.
write("8-sep.csv", ("sep=;\r\n" + lines([HEADER] + [person(i) for i in range(10)], sep=";")).encode())

# 9: two cells longer than Excel's 32,767-character limit.
rows = [HEADER] + [person(i) for i in range(10)]
rows[3][3] = "y" * 40_000
rows[7][1] = "z" * 32_768
write("9-long-cells.csv", lines(rows).encode())

# 10: semicolon file (to be opened with the separator forced to comma: one column).
write("10-semicolon.csv", lines([HEADER] + [person(i) for i in range(12)], sep=";").encode())

print("written to", OUT, "| encoding bad row (0-based):", ENCODING_BAD_ROW)

# ---------------------------------------------------------------------------
# Expected results, written from what was planted above (not from DataFixer's
# output). Each issue: [severity, count, first rows (0-based file rows)].
import csv
import io
import json

E, W, N = "error", "warning", "note"
expected = {
    "0-clean.csv": {"valid": True, "issues": {}},
    "1-uneven.csv": {"valid": False, "issues": {"uneven-rows": [E, 5, [5, 12, 19, 26, 32]]}},
    "2-header.csv": {"valid": False, "issues": {
        "empty-header": [E, 1, [0]], "duplicate-header": [E, 1, [0]],
        "header-spaces": [W, 2, [0]], "long-header": [N, 1, [0]]}},
    "3-quotes.csv": {"valid": True, "issues": {"stray-quotes": [W, 2, [5, 16]], "line-breaks-in-cells": [N, 3, [8, 9, 21]]}},
    "3b-unclosed.csv": {"valid": False, "issues": {"unclosed-quote": [E, 1, [10]]}},
    "4-encoding.csv": {"valid": False, "issues": {"unreadable-characters": [E, 2, [ENCODING_BAD_ROW]]}},
    # blank lines follow file lines 6, 10 and 15 → rows 6, 11, 17 once earlier blanks are counted
    "5-line-endings.csv": {"valid": True, "issues": {"blank-lines": [W, 3, [6, 11, 17]], "mixed-line-endings": [W, 1, []], "no-final-line-break": [N, 1, []]}},
    "5b-cr.csv": {"valid": True, "issues": {"old-mac-line-endings": [W, 1, []]}},
    "6-control.csv": {"valid": False, "issues": {"control-characters": [E, 3, [3, 8, 12]], "formula-like": [W, 4, [5, 10, 14, 16]]}},
    "7-trailing.csv": {"valid": True, "issues": {"trailing-separators": [N, 16, []]}},
    "8-sep.csv": {"valid": True, "issues": {"sep-line": [N, 1, [0]]}},
    "9-long-cells.csv": {"valid": True, "issues": {"cell-too-long": [W, 2, [3, 7]]}},
    "10-semicolon.csv": {"open": {"delimiter": ","}, "valid": True, "issues": {"single-column": [W, 1, []]}},
}

# Independent reading by Python's csv module (it accepts mixed line endings), for
# comparison with DataFixer's reader. Blank lines are [] in Python and [""] in DataFixer.
def python_rows(name, delimiter=","):
    with open(OUT / name, newline="", encoding="utf-8") as f:
        return [r if r else [""] for r in csv.reader(f, delimiter=delimiter)]

python = {n: python_rows(n) for n in ["0-clean.csv", "1-uneven.csv", "2-header.csv", "3-quotes.csv", "5-line-endings.csv", "5b-cr.csv", "6-control.csv", "7-trailing.csv"]}
(OUT / "expected.json").write_text(json.dumps({"expected": expected, "python": python}, indent=1, ensure_ascii=False) + "\n")
print("expected.json written")
