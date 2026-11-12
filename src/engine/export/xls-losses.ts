/** No imports: pages can show this list without loading the Excel reader. */
/** Measured: what a SheetJS rebuild of an .xls workbook does not keep. */
export const XLS_REBUILD_LOSSES = [
  "Formatting such as fonts, colours, fills and borders (number formats, column widths, merged cells, comments and hyperlinks are kept)",
  "Conditional formatting",
  "Data validation rules",
  "Charts, images and drawings (chart sheets become empty sheets)",
  "“Very hidden” sheets become ordinary hidden sheets",
];
