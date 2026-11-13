"""Stage 6 test pack for CSV → Excel (owner decision 1): planted values with the
expected Excel cell written from the rules, not from DataFixer's output.
Run: python3 scripts/fixtures/make_convert_pack.py
"""
import csv
import io
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "convert"
OUT.mkdir(parents=True, exist_ok=True)

# value, expected kind, expected Excel value (numbers/dates: number; text: the text), expected number format
# Dates: Excel serial = days since 1899-12-30.
PLANTED = [
    ("42", "number", 42, ""),
    ("-3.5", "number", -3.5, "0.0"),
    ("0.25", "number", 0.25, "0.00"),
    ("1.50", "number", 1.5, "0.00"),
    ("0", "number", 0, ""),
    ("123456789012", "number", 123456789012, "0"),
    ("999999999999999", "number", 999999999999999, "0"),
    ("2024-03-15", "date", 45366, "yyyy-mm-dd"),
    ("1900-03-01", "date", 61, "yyyy-mm-dd"),
    ("9999-12-31", "date", 2958465, "yyyy-mm-dd"),
    ("1234567890123456", "text", "1234567890123456", ""),
    ("007", "text", "007", ""),
    ("0044 20 7946 0958", "text", "0044 20 7946 0958", ""),
    ("1,250", "text", "1,250", ""),
    ("1 250", "text", "1 250", ""),
    ("12%", "text", "12%", ""),
    ("$5", "text", "$5", ""),
    ("€5", "text", "€5", ""),
    ("1e5", "text", "1e5", ""),
    ("+5", "text", "+5", ""),
    ("-0", "text", "-0", ""),
    ("03/04/2024", "text", "03/04/2024", ""),
    ("15.03.2024", "text", "15.03.2024", ""),
    ("2023-02-30", "text", "2023-02-30", ""),
    ("1899-12-31", "text", "1899-12-31", ""),
    ("2024-03-15 10:30", "text", "2024-03-15 10:30", ""),
    ("=1+1", "text", "=1+1", ""),
    ("@SUM(A1)", "text", "@SUM(A1)", ""),
    ("TRUE", "text", "TRUE", ""),
    (" 42 ", "text", " 42 ", ""),
    ("abc", "text", "abc", ""),
    ("Flat 7\nMain Street", "text", "Flat 7\nMain Street", ""),
    ("emoji 😀 é", "text", "emoji 😀 é", ""),
    ("", "empty", None, ""),
]

# 1-values.csv: header + one row per planted value (column B), with an id (number) and a note (text).
buf = io.StringIO(newline="")
w = csv.writer(buf, lineterminator="\r\n")
w.writerow(["id", "value", "note"])
for i, (v, *_rest) in enumerate(PLANTED):
    w.writerow([str(i + 1), v, f"row {i + 1}"])
(OUT / "1-values.csv").write_bytes(buf.getvalue().encode("utf-8"))

# 2-customers.csv: a realistic file.
rows = [["customer_id", "name", "phone", "zip", "joined", "balance", "orders", "notes"]]
for i in range(1, 41):
    rows.append([
        f"C{i:04d}" if i % 2 else f"{i:05d}",
        ["Asha", "Ben", "Chen", "Dara", "Eli"][i % 5],
        f"+44 20 7946 {1000 + i}" if i % 3 == 0 else f"0{7700900000 + i}",
        f"{(i * 37) % 99999:05d}",
        f"2024-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}" if i % 4 else f"{(i % 28) + 1:02d}/{(i % 12) + 1:02d}/2024",
        f"{i * 12.5:.2f}",
        str(i % 7),
        "VIP" if i % 10 == 0 else "",
    ])
buf = io.StringIO(newline="")
csv.writer(buf, lineterminator="\r\n").writerows(rows)
(OUT / "2-customers.csv").write_bytes(buf.getvalue().encode("utf-8"))

def expect_customers():
    # Expected kinds per column, from the rules: ids "C0001" text / "00002" leading zero text; phones text;
    # zip with leading zero text unless it has none; joined ISO → date, dd/mm/yyyy → text; balance → number "0.00";
    # orders → number; notes text/empty.
    numbers = dates = text = empty = 0
    for r in rows[1:]:
        for col, v in enumerate(r):
            if v == "":
                empty += 1
            elif col == 4 and "-" in v:
                dates += 1
            elif col in (5, 6) or (col == 3 and not v.startswith("0")):
                numbers += 1
            else:
                text += 1
    return {"numbers": numbers, "dates": dates, "text": text, "empty": empty}

(OUT / "expected.json").write_text(json.dumps({
    "planted": [{"value": v, "kind": k, "excel": x, "format": f} for v, k, x, f in PLANTED],
    "customers": expect_customers(),
}, indent=1, ensure_ascii=False) + "\n")
print("written to", OUT)
