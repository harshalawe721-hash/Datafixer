#!/usr/bin/env python3
"""
Build 2-problems.xlsx from problems.json (written by make_scan_pack.ts):
real numbers, real dates, a real =1/0 formula, "1250" stored as text.
LibreOffice re-saves it so the formula has a saved result, like Excel.
Usage: python3 make_scan_xlsx.py PACK_DIR
"""
import datetime as dt, json, os, shutil, subprocess, sys, tempfile
import openpyxl

pack = sys.argv[1]
spec = json.load(open(os.path.join(pack, "problems.json")))
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Customers"
ws.append(spec["header"])
for r, row in enumerate(spec["rows"], start=2):
    for c, v in enumerate(row, start=1):
        if v is None:
            continue
        cell = ws.cell(r, c)
        if isinstance(v, dict) and "formula" in v:
            cell.value = "=" + v["formula"]
        elif isinstance(v, dict) and "date" in v:
            cell.value = dt.date.fromisoformat(v["date"])
            cell.number_format = "yyyy-mm-dd"
        elif v == "1,250":
            # A number stored as text among real numbers. Kept inside the column's usual
            # range (100-299) so it triggers only "Numbers stored as text", not also
            # "Unusual values" (1250 would be both, correctly).
            cell.value = "250"
        else:
            cell.value = v
tmp = tempfile.mkdtemp()
src = os.path.join(tmp, "2-problems.xlsx")
wb.save(src)
out = os.path.join(tmp, "out")
subprocess.run(["soffice", "--headless", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", out, src],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
shutil.copy(os.path.join(out, "2-problems.xlsx"), os.path.join(pack, "2-problems.xlsx"))
shutil.rmtree(tmp, ignore_errors=True)
print("2-problems.xlsx written")
