/**
 * Compact, growable lists of affected rows and cells for one check.
 * Kept in the worker for "view affected data"; only counts and a few
 * examples are sent to the page.
 */

/** Cell lists are capped to bound memory; counts stay exact. */
export const MAX_CELLS_PER_ISSUE = 1_000_000;

export class RowList {
  private data = new Uint32Array(1024);
  private n = 0;
  /** Add a row; consecutive duplicates are ignored (rows arrive in order). */
  add(row: number): void {
    if (this.n > 0 && this.data[this.n - 1] === row) return;
    if (this.n === this.data.length) {
      const next = new Uint32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.n++] = row;
  }
  get size(): number {
    return this.n;
  }
  toArray(): Uint32Array {
    return this.data.slice(0, this.n);
  }
}

export class CellList {
  private data = new Float64Array(1024);
  private n = 0;
  /** Total cells added, including any beyond the cap. */
  total = 0;
  add(key: number): void {
    this.total++;
    if (this.n >= MAX_CELLS_PER_ISSUE) return;
    if (this.n === this.data.length) {
      const next = new Float64Array(Math.min(this.data.length * 2, MAX_CELLS_PER_ISSUE));
      next.set(this.data);
      this.data = next;
    }
    this.data[this.n++] = key;
  }
  get truncated(): boolean {
    return this.total > this.n;
  }
  toArray(): Float64Array {
    return this.data.slice(0, this.n);
  }
}
