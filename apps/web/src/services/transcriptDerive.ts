// Pure derive helpers consumed by the Transcript page and counselor tab.
// No API calls, no side effects — safe to import anywhere.

export interface RigorCounts { ap: number; honors: number; ib: number }
export interface TranscriptRow { courseLevel: string | null }

/**
 * Count AP / Honors / IB courses across all years for the rigor card.
 * Case-insensitive. Nullish byYear is tolerated (returns zeros).
 */
export function countCourseRigor(byYear: Record<string, Array<TranscriptRow>>): RigorCounts {
  const counts: RigorCounts = { ap: 0, honors: 0, ib: 0 };
  for (const rows of Object.values(byYear ?? {})) {
    for (const row of rows) {
      const level = (row.courseLevel ?? "").toLowerCase();
      if (level === "ap") counts.ap += 1;
      else if (level === "honors") counts.honors += 1;
      else if (level === "ib") counts.ib += 1;
    }
  }
  return counts;
}

export interface GpaTrendPoint { year: string; gpaUnweighted: number | null; gpaWeighted: number | null }

/**
 * Build the GPA-trend series (oldest → newest) for the sparkline.
 * Null or undefined yearlyBreakdown returns an empty array.
 */
export function buildGpaTrend(
  yearlyBreakdown: Record<string, { gpaUnweighted?: number | null; gpaWeighted?: number | null }> | null | undefined,
): GpaTrendPoint[] {
  if (!yearlyBreakdown) return [];
  return Object.keys(yearlyBreakdown)
    .sort((a, b) => a.localeCompare(b))
    .map((year) => ({
      year,
      gpaUnweighted: yearlyBreakdown[year].gpaUnweighted ?? null,
      gpaWeighted: yearlyBreakdown[year].gpaWeighted ?? null,
    }));
}
