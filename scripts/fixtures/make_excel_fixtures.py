#!/usr/bin/env python3
"""
Builds Excel test fixtures with producers that are independent of SheetJS:
  * openpyxl creates workbooks with formulas, formats, merges, hyperlinks,
    hidden rows/columns/sheets, data validation, conditional formatting,
    comments, an image, a chart and a chartsheet;
  * LibreOffice (headless) re-saves them as XLSX (with cached formula
    results, like Excel) and as genuine Excel 97-2003 .xls (BIFF8);
  * msoffcrypto-tool creates a password-protected XLSX.

Usage:  python3 scripts/fixtures/make_excel_fixtures.py tests/fixtures/excel
Needs:  openpyxl, Pillow, LibreOffice (soffice), msoffcrypto-tool (optional).
The generated files are committed, so tests do not need these tools.
"""
import datetime as dt
import io
import os
import shutil
import subprocess
import sys
import tempfile

import openpyxl
from openpyxl.chart import BarChart, Reference
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.workbook.defined_name import DefinedName

OUT = sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures/excel"
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp()


def lo_convert(src, fmt, filt):
    """Re-save with LibreOffice; returns output path."""
    outdir = os.path.join(TMP, fmt + "-out")
    os.makedirs(outdir, exist_ok=True)
    subprocess.run(
        ["soffice", "--headless", "--convert-to", f"{fmt}:{filt}", "--outdir", outdir, src],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
    )
    return os.path.join(outdir, os.path.splitext(os.path.basename(src))[0] + "." + fmt)


def features_workbook(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(["Name", "Amount", "Date", "Active", "Formula", "Link"])
    rows = [
        ("Ann", 10.5, dt.date(2024, 1, 31), True, "=B2*2"),
        ("Zoë 東京 😀", 1234.567, dt.date(2023, 12, 1), False, "=SUM(B2:B3)"),
        ("Bob", 0, dt.date(2022, 6, 15), True, "=1/0"),
        ("Eve", -5, dt.date(2021, 2, 28), False, "=NA()"),
    ]
    for r in rows:
        ws.append(list(r))
    for row in range(2, 6):
        ws.cell(row, 2).number_format = "#,##0.00"
        ws.cell(row, 3).number_format = "yyyy-mm-dd"
    ws["F2"] = "Example"
    ws["F2"].hyperlink = "https://example.com/"
    ws["H1"] = "Merged header"
    ws.merge_cells("H1:I1")
    ws["G2"] = "hidden column value"
    ws.column_dimensions["G"].hidden = True
    ws.column_dimensions["A"].width = 25
    ws.row_dimensions[2].height = 30
    ws.row_dimensions[4].hidden = True
    ws["A1"].font = Font(bold=True)
    ws["A1"].fill = PatternFill("solid", fgColor="FFFF00")
    dv = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("D2:D5")
    ws.conditional_formatting.add("B2:B5", CellIsRule(operator="lessThan", formula=["0"], fill=PatternFill("solid", fgColor="FF9999")))
    ws["A2"].comment = Comment("A note", "Tester")
    chart = BarChart()
    chart.add_data(Reference(ws, min_col=2, min_row=1, max_row=5), titles_from_data=True)
    ws.add_chart(chart, "K2")
    try:
        from PIL import Image as PILImage
        from openpyxl.drawing.image import Image

        buf = io.BytesIO()
        PILImage.new("RGB", (4, 4), (30, 64, 175)).save(buf, "PNG")
        buf.seek(0)
        ws.add_image(Image(buf), "K20")
    except ImportError:
        pass
    wb.defined_names["Amounts"] = DefinedName("Amounts", attr_text="Data!$B$2:$B$5")

    summary = wb.create_sheet("Summary")
    summary["A1"] = "Total"
    summary["B1"] = "=SUM(Data!B2:B5)"
    summary["A2"] = "First name"
    summary["B2"] = "=Data!A2"

    archive = wb.create_sheet("Archive")
    archive.append(["old", 1])
    archive.sheet_state = "hidden"
    secret = wb.create_sheet("Secret")
    secret.append(["very hidden", 2])
    secret.sheet_state = "veryHidden"

    cs = wb.create_chartsheet("Chart1")
    chart2 = BarChart()
    chart2.add_data(Reference(ws, min_col=2, min_row=1, max_row=5), titles_from_data=True)
    cs.add_chart(chart2)
    wb.save(path)


def main():
    src = os.path.join(TMP, "features.xlsx")
    features_workbook(src)
    # openpyxl output: formulas without cached results (tests "no cached value").
    shutil.copy(src, os.path.join(OUT, "openpyxl-features.xlsx"))
    # LibreOffice output: like Excel, stores cached results.
    shutil.copy(lo_convert(src, "xlsx", "Calc MS Excel 2007 XML"), os.path.join(OUT, "lo-features.xlsx"))
    shutil.copy(lo_convert(src, "xls", "MS Excel 97"), os.path.join(OUT, "lo-features.xls"))

    # Empty workbook
    empty = os.path.join(TMP, "empty.xlsx")
    openpyxl.Workbook().save(empty)
    shutil.copy(empty, os.path.join(OUT, "empty.xlsx"))
    shutil.copy(lo_convert(empty, "xls", "MS Excel 97"), os.path.join(OUT, "empty.xls"))

    # 1904 date system
    wb = openpyxl.Workbook()
    wb.epoch = openpyxl.utils.datetime.CALENDAR_MAC_1904
    ws = wb.active
    ws["A1"] = dt.date(2024, 1, 31)
    ws["A1"].number_format = "yyyy-mm-dd"
    wb.save(os.path.join(OUT, "date1904.xlsx"))

    # Multiple sheets with data, Unicode sheet names
    wb = openpyxl.Workbook()
    for i, name in enumerate(["January", "Février", "三月"]):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = name
        ws.append(["id", "value"])
        for r in range(1, 101):
            ws.append([r, r * (i + 1)])
    multi = os.path.join(TMP, "multi.xlsx")
    wb.save(multi)
    shutil.copy(lo_convert(multi, "xlsx", "Calc MS Excel 2007 XML"), os.path.join(OUT, "lo-multisheet.xlsx"))
    shutil.copy(lo_convert(multi, "xls", "MS Excel 97"), os.path.join(OUT, "lo-multisheet.xls"))

    # Password-protected XLSX (agile encryption, password "secret")
    try:
        from msoffcrypto.format.ooxml import OOXMLFile

        with open(os.path.join(OUT, "openpyxl-features.xlsx"), "rb") as fin, open(os.path.join(OUT, "encrypted.xlsx"), "wb") as fout:
            OOXMLFile(fin).encrypt("secret", fout)
    except ImportError:
        print("msoffcrypto-tool not installed: encrypted.xlsx not generated")

    shutil.rmtree(TMP, ignore_errors=True)
    for f in sorted(os.listdir(OUT)):
        print(f"{f}: {os.path.getsize(os.path.join(OUT, f))} bytes")


if __name__ == "__main__":
    main()
