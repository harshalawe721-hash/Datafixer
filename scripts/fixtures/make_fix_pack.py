"""Stage 4 test pack: an Excel workbook where removing rows would break a formula and a chart.
Usage: python3 scripts/fixtures/make_fix_pack.py tests/fixtures/fix"""
import sys
import openpyxl
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Font, PatternFill

out = sys.argv[1]
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Sales"
ws.append(["id", "customer", "city", "amount"])
for c in ws[1]:
    c.font = Font(bold=True)
    c.fill = PatternFill("solid", fgColor="FFDDEEFF")
rows = [(1, "Ann", "Paris"), (2, " Bob", "London"), (3, "Cy", "paris"), (4, "Dee", "Berlin"), (5, "Eve", "London"), (6, "Fay", "Paris"), (7, "Gus", "Rome"), (8, "Hal", "Paris")]
for i, name, city in rows:
    ws.append([i, name, city, i * 100])
ws.append([4, "Dee", "Berlin", 400])  # exact copy of row 5
ws.append([6, "Fay", "Paris", 600])  # exact copy of row 7
ws.column_dimensions["B"].width = 24
summary = wb.create_sheet("Summary")
summary["A1"] = "Total sales"
summary["B1"] = "=SUM(Sales!D2:D11)"
chart = BarChart()
chart.title = "Sales"
chart.add_data(Reference(ws, min_col=4, min_row=1, max_row=11), titles_from_data=True)
ws.add_chart(chart, "F2")
wb.save(f"{out}/6-excel-references.xlsx")
print("ok")
