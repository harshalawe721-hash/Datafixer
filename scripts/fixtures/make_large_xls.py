#!/usr/bin/env python3
"""
Build a large genuine Excel 97-2003 (.xls) file for performance tests:
openpyxl (write-only) creates an XLSX with several 65,000-row sheets, then
LibreOffice converts it to .xls (BIFF8 allows 65,536 rows per sheet).

Usage: python3 make_large_xls.py OUT.xls TARGET_MB
"""
import os, random, subprocess, sys, tempfile
import openpyxl

out, target_mb = sys.argv[1], float(sys.argv[2])
tmp = tempfile.mkdtemp()
src = os.path.join(tmp, "large.xlsx")
words = ["alpha", "bravo", "delta", "echo", "kilo", "lima", "oscar", "Zürich", "café"]
rnd = random.Random(42)
# Measured: ~0.13 MB of XLS per 1,000 rows of 8 columns (LibreOffice output).
rows_total = int(target_mb / 0.13 * 1000)
wb = openpyxl.Workbook(write_only=True)
done = 0
while done < rows_total:
    ws = wb.create_sheet(f"Sheet{len(wb.worksheets) + 1}")
    ws.append(["id", "name", "amount", "code", "city", "qty", "price", "note"])
    n = min(65000, rows_total - done)
    for i in range(n):
        k = done + i
        ws.append([k, f"{words[k % 9]} {rnd.randint(0, 999999)}", round(rnd.random() * 1e5, 2), rnd.randint(0, 10**7),
                   f"City {k % 500}", rnd.randint(1, 500), round(rnd.random() * 100, 2), words[rnd.randint(0, 8)]])
    done += n
wb.save(src)
subprocess.run(["soffice", "--headless", "--convert-to", "xls:MS Excel 97", "--outdir", tmp, src],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3600)
os.replace(os.path.join(tmp, "large.xls"), out)
print(f"{out}: {os.path.getsize(out) / 1048576:.1f} MB, {done} rows in {len(wb.worksheets)} sheets")
