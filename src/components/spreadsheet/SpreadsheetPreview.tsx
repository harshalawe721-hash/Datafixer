"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Filter, Loader2, Search, X } from "lucide-react";
import type { RowPage, RowQuery, SortSpec } from "@/engine/query/query";
import { columnLetter } from "@/engine/query/query";
import type { ScanIssue, Severity } from "@/engine/scan/scan";
import { cn } from "@/lib/cn";

export interface SpreadsheetPreviewProps {
  sheet: string;
  /** Fetch a page of rows (from the engine worker). */
  getRows: (sheet: string, query: RowQuery) => Promise<RowPage>;
  /** "First row contains column names" (controlled by the workspace). */
  headerRow: boolean;
  onHeaderRowChange: (headerRow: boolean) => void;
  /** Error Detector issue being viewed: rows are filtered and its cells highlighted. */
  issue?: ScanIssue | null;
  onClearIssue?: () => void;
  /** Changes whenever the data changes (Stage 4 fixes, undo, redo): the page is fetched again. */
  dataVersion?: number;
}

const PAGE_SIZES = [50, 100, 250, 500] as const;
const COLUMN_WINDOW = 50;

/** Highlight for cells flagged by the issue being viewed, by severity. */
const flagClass: Record<Severity, string> = {
  error: "bg-danger-soft text-danger outline outline-1 -outline-offset-1 outline-danger/50",
  warning: "bg-warning-soft outline outline-1 -outline-offset-1 outline-warning/50",
  note: "bg-secondary outline outline-1 -outline-offset-1 outline-primary/40",
};

/**
 * Reusable spreadsheet table. Rows are paged and columns are windowed, so the
 * DOM stays small for any file size; sorting and searching run in the worker.
 */
export function SpreadsheetPreview({ sheet, getRows, headerRow, onHeaderRowChange, issue = null, onClearIssue, dataVersion = 0 }: SpreadsheetPreviewProps) {
  const id = useId();
  const issueId = issue?.id;
  const [pageSize, setPageSize] = useState<number>(100);
  const [page, setPage] = useState(0);
  const [colStart, setColStart] = useState(0);
  const [sort, setSort] = useState<SortSpec | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<RowPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debounce search typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Back to the first page whenever the filter changes.
  const [lastIssue, setLastIssue] = useState(issueId);
  if (issueId !== lastIssue) {
    setLastIssue(issueId);
    setPage(0);
  }

  const query = useMemo<RowQuery>(
    () => ({ offset: page * pageSize, limit: pageSize, columnOffset: colStart, columnLimit: COLUMN_WINDOW, headerRow, sort, search, issue: issueId }),
    [page, pageSize, colStart, headerRow, sort, search, issueId],
  );

  useEffect(() => {
    const seq = ++requestSeq.current;
    let active = true;
    const t = setTimeout(() => active && setLoading(true), 150); // avoid flicker on fast responses
    getRows(sheet, query)
      .then((res) => {
        if (seq !== requestSeq.current) return; // a newer request superseded this one
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "The preview could not be loaded.");
      })
      .finally(() => {
        active = false;
        clearTimeout(t);
        if (seq === requestSeq.current) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [getRows, sheet, query, dataVersion]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page, pageSize, sort, search, headerRow, issueId]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columnCount = data?.columnCount ?? 0;
  const visibleCols = data ? (data.rows[0]?.cells.length ?? data.header?.length ?? Math.min(COLUMN_WINDOW, columnCount - colStart)) : 0;

  function toggleSort(col: number) {
    setPage(0);
    setSort((s) => (!s || s.column !== col ? { column: col, direction: "asc" } : s.direction === "asc" ? { column: col, direction: "desc" } : null));
  }

  const firstRow = total === 0 ? 0 : page * pageSize + 1;
  const lastRow = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <label htmlFor={`${id}-search`} className="sr-only">
            Search in data
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id={`${id}-search`}
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search in data…"
            className="h-10 w-full rounded-xl border border-line-strong bg-background pr-3 pl-9 text-sm focus:border-primary focus:outline-2 focus:outline-ring/40"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={headerRow}
              onChange={(e) => {
                onHeaderRowChange(e.target.checked);
                setPage(0);
                setSort(null);
              }}
              className="size-4 accent-[var(--primary)]"
            />
            First row contains column names
          </label>
          <label className="inline-flex items-center gap-2">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="h-9 rounded-lg border border-line-strong bg-background px-2"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {issue && (
        <div className="flex flex-col gap-2 border-b border-line bg-surface-muted px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between" role="status">
          <p className="flex items-start gap-2">
            <Filter className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Showing {data ? `${data.total.toLocaleString("en-US")} ` : ""}
              {data?.total === 1 ? "row" : "rows"} affected by <strong>{issue.title}</strong>. Highlighted cells show where.
            </span>
          </p>
          {onClearIssue && (
            <button type="button" onClick={onClearIssue} className="inline-flex h-9 shrink-0 items-center gap-1 self-start rounded-lg border border-line-strong bg-surface px-3 font-medium hover:bg-surface-muted sm:self-auto">
              <X className="size-4" aria-hidden="true" /> Show all rows
            </button>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="m-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-start justify-center bg-surface/50 pt-16" aria-live="polite">
              <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm shadow-card">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
              </span>
            </div>
          )}
          <div ref={scrollRef} className="max-h-[32rem] overflow-auto overscroll-contain" tabIndex={0} aria-label="Spreadsheet preview, scrollable">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                Preview of sheet {sheet}, rows {firstRow} to {lastRow} of {total}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky top-0 left-0 z-10 border-r border-b border-line bg-surface-muted px-3 py-2 text-right text-xs font-medium text-muted">
                    #
                  </th>
                  {Array.from({ length: visibleCols }, (_, i) => {
                    const col = colStart + i;
                    const label = data?.header?.[i];
                    const active = sort?.column === col;
                    return (
                      <th
                        key={col}
                        scope="col"
                        aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"}
                        className="sticky top-0 z-[5] border-r border-b border-line bg-surface-muted p-0 text-left font-semibold"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col)}
                          className="flex w-full max-w-64 min-w-24 items-center justify-between gap-2 px-3 py-2 text-left hover:bg-line/50"
                          title={`Sort by ${label || `column ${columnLetter(col)}`}`}
                          aria-label={`Sort by ${label ? `${label} (column ${columnLetter(col)})` : `column ${columnLetter(col)}`}`}
                        >
                          <span className="min-w-0">
                            <span className="block text-[11px] font-medium text-muted">{columnLetter(col)}</span>
                            {headerRow && <span className="block truncate">{label || <em className="text-muted">(no name)</em>}</span>}
                          </span>
                          {active ? (
                            sort!.direction === "asc" ? <ArrowUp className="size-3.5 shrink-0 text-primary" aria-hidden="true" /> : <ArrowDown className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3.5 shrink-0 text-muted/60" aria-hidden="true" />
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((row) => (
                  <tr key={row.index} className="group">
                    <th scope="row" className="sticky left-0 z-[1] border-r border-b border-line bg-surface-muted px-3 py-1.5 text-right text-xs font-normal text-muted tabular-nums">
                      {row.index + 1}
                    </th>
                    {row.cells.map((value, i) => {
                      const col = colStart + i;
                      const flagged = issue && row.flaggedColumns?.includes(col);
                      const isError = row.errorColumns?.includes(col);
                      const isFormula = row.formulaColumns?.includes(col);
                      const isEdited = row.editedColumns?.includes(col);
                      return (
                        <td
                          key={col}
                          title={isEdited ? `Changed: ${value}` : value.length > 40 ? value : undefined}
                          data-edited={isEdited || undefined}
                          className={cn(
                            "max-w-64 truncate border-r border-b border-line px-3 py-1.5 whitespace-pre group-hover:bg-surface-muted/60",
                            isEdited && !flagged && "bg-success-soft",
                            flagged && flagClass[issue.severity],
                            isError && "font-medium text-danger",
                          )}
                        >
                          {isFormula && <span className="mr-1 rounded bg-secondary px-1 text-[10px] font-semibold text-secondary-foreground" title="Formula">fx</span>}
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.rows.length === 0 && (
              <p className="p-8 text-center text-sm text-muted">{search ? `No rows contain “${search}”.` : "This sheet has no data rows."}</p>
            )}
          </div>
        </div>
      )}

      {/* Footer: row and column navigation */}
      <div className="flex flex-col gap-3 border-t border-line p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted" aria-live="polite">
          {total.toLocaleString("en-US")} {search ? `matching row${total === 1 ? "" : "s"} (of ${data?.totalUnfiltered.toLocaleString("en-US") ?? 0})` : `${headerRow ? "data " : ""}row${total === 1 ? "" : "s"}`}
          {columnCount > 0 && ` · ${columnCount.toLocaleString("en-US")} column${columnCount === 1 ? "" : "s"}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {columnCount > COLUMN_WINDOW && (
            <div className="mr-2 flex items-center gap-1">
              <button type="button" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-2 disabled:opacity-40" disabled={colStart === 0} onClick={() => setColStart(Math.max(0, colStart - COLUMN_WINDOW))} aria-label="Previous columns">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <span className="text-muted">
                Columns {columnLetter(colStart)}–{columnLetter(Math.min(columnCount, colStart + COLUMN_WINDOW) - 1)}
              </span>
              <button type="button" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-2 disabled:opacity-40" disabled={colStart + COLUMN_WINDOW >= columnCount} onClick={() => setColStart(colStart + COLUMN_WINDOW)} aria-label="Next columns">
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}
          <button type="button" className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong px-3 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden="true" /> Previous
          </button>
          <span className="tabular-nums text-muted">
            {firstRow.toLocaleString("en-US")}–{lastRow.toLocaleString("en-US")} · page {(page + 1).toLocaleString("en-US")} of {pageCount.toLocaleString("en-US")}
          </span>
          <button type="button" className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong px-3 disabled:opacity-40" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
