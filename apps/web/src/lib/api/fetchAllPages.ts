/** Both backends clamp a list page to 100 rows. */
export const API_PAGE_MAX = 100;

/**
 * Every row of a paged list endpoint. Asking for `limit=500` or `limit=1000` silently returned the first 100 rows
 * (audit 2026-10-09 D4); this walks the pages instead, stopping at a short page or the reported last page, and is
 * bounded at `maxPages` pages (5,000 rows by default).
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{ rows: T[]; totalPages?: number | null }>,
  { pageSize = API_PAGE_MAX, maxPages = 50 }: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { rows, totalPages } = await fetchPage(page, pageSize);
    all.push(...rows);
    if (rows.length < pageSize || page >= (totalPages ?? Number.POSITIVE_INFINITY)) break;
  }
  return all;
}
