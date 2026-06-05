/**
 * Acceptance rates are stored as fractions in the universities table
 * (0.68 = 68%, 1 = 100%); some legacy rows may already hold percentages.
 * Values ≤ 1 are treated as fractions.
 */
export function formatAcceptanceRate(rate: number | string | null | undefined): string {
  const n = Number(rate);
  if (!rate || Number.isNaN(n) || n <= 0) return "—";
  const pct = n <= 1 ? n * 100 : n;
  return `${Math.round(pct)}%`;
}
