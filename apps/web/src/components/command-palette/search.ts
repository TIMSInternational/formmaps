/**
 * Accent- and case-insensitive matching for the command palette (#407):
 * "medicina" finds "Medicina", "educacion" finds "Educación", "ingenieria"
 * finds "Ingeniería" — Spanish and English content alike.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Every whitespace-separated term of the query must appear somewhere in the haystack. */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;
  const text = normalizeForSearch(haystack);
  return terms.every((term) => text.includes(term));
}

/** cmdk `filter` prop: the same accent-insensitive rule for static pages/actions. */
export function paletteFilter(value: string, search: string, keywords?: string[]): number {
  if (!search.trim()) return 1;
  return matchesQuery(`${value} ${(keywords ?? []).join(" ")}`, search) ? 1 : 0;
}
