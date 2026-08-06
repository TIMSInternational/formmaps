"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
  getAssessmentPeriods,
  createAssessmentPeriod,
  updateAssessmentPeriod,
  deleteAssessmentPeriod,
  getHolidays,
  createHolidays,
  deleteHoliday,
} from "@/services/calendarService";
import type {
  AcademicYear,
  AcademicYearPayload,
  AssessmentPeriod,
  AssessmentPeriodPayload,
  Holiday,
  HolidayPayload,
} from "@/types/calendar";
import {
  appendItem,
  optimisticId,
  patchBy,
  removeBy,
  useOptimisticCache,
} from "./useOptimisticCache";

// ── formmaps#89: optimistic calendar writes ─────────────────────────────────────
//
// All eight mutations here patch the cache before the server answers. The three
// caches hold plain arrays in the order the reader hands them back (CalendarReader:
// years by startDate DESC, periods by startDate ASC, holidays by date ASC), so an
// insert is sorted into place rather than appended — an appended row sits in the
// wrong position until the reconcile lands and then jumps.
//
// What is NOT guessed:
//
//   ids       -> every write echoes a small envelope ({id,name} / {count}), never the
//                row, so an insert goes in under an `optimisticId()` placeholder and
//                the settle reconciles the real id. Term ids are never echoed at all.
//   isCurrent -> not a guess: the create INSERT omits the column and its DB default is
//                false, so a new year is never the current one. Nothing here sets it
//                (the set-current endpoint has no hook in this file).
//   the delete-a-year fan-out -> refetched, not simulated. See useDeleteAcademicYear.
//
// No toasts, unlike the other converted hooks: CalendarPanel passes its own translated
// onSuccess/onError into `.mutate()`, and one here would fire a second, untranslated
// toast beside it.
//
// The general rules live in useOptimisticCache.ts.

// ============================================
// Query Keys
// ============================================

export const calendarKeys = {
  all: ["calendar"] as const,
  academicYears: () => [...calendarKeys.all, "academic-years"] as const,
  assessmentPeriods: () => [...calendarKeys.all, "assessment-periods"] as const,
  holidays: () => [...calendarKeys.all, "holidays"] as const,
};

// ============================================
// Cache helpers
// ============================================

/**
 * Run `change` over one of the list caches, declining anything that is not the array
 * the reader returns.
 *
 * The guard is not paranoia: `unwrap()` in calendarService falls back to the whole
 * response body when it carries no `data`, so a non-list can reach these caches —
 * which is exactly why CalendarPanel reads every one of them through `Array.isArray`.
 * Spreading a non-array in an updater would throw inside setQueryData.
 */
function patchList<T>(current: T[], change: (rows: T[]) => T[] | undefined): T[] | undefined {
  return Array.isArray(current) ? change(current) : undefined;
}

/**
 * Epoch ms for a date this app holds in two forms at once: the API sends ISO-Z
 * (`2026-08-01T00:00:00.000Z`) and an optimistic row carries the `<input type="date">`
 * value it was built from (`2026-08-01`). Both parse, and to the same instant.
 */
const time = (value: string) => Date.parse(value) || 0;

/**
 * Re-sort a list into the reader's order. Applied to the whole list rather than to the
 * inserted row alone, because an edit can move an existing row too. `Array.sort` is
 * stable, so rows the comparator ties on keep the order the server gave them.
 */
const sortRows = <T,>(rows: readonly T[], order: (a: T, b: T) => number): T[] =>
  [...rows].sort(order);

const byStartDateDesc = (a: { startDate: string }, b: { startDate: string }) =>
  time(b.startDate) - time(a.startDate);
const byStartDateAsc = (a: { startDate: string }, b: { startDate: string }) =>
  time(a.startDate) - time(b.startDate);
const byDateAsc = (a: { date: string }, b: { date: string }) => time(a.date) - time(b.date);

// ============================================
// Academic Year Hooks
// ============================================

export function useAcademicYears() {
  return useQuery({
    queryKey: calendarKeys.academicYears(),
    queryFn: getAcademicYears,
    staleTime: 1000 * 60 * 30,
  });
}

export function useCreateAcademicYear() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (data: AcademicYearPayload) => createAcademicYear(data),

    onMutate: (data) =>
      optimistic.patch<AcademicYear[]>({ queryKey: calendarKeys.academicYears() }, (current) =>
        patchList(current, (rows) =>
          sortRows(
            appendItem(rows, {
              id: optimisticId(),
              name: data.name,
              startDate: data.startDate,
              endDate: data.endDate,
              // The INSERT omits isCurrent, so the row lands on the column default.
              isCurrent: false,
              // sortOrder is the array index the writer inserts by, which is also the
              // order the reader returns terms in — so the sub-rows render as entered.
              terms: data.terms.map((term, index) => ({
                id: optimisticId(),
                ...term,
                sortOrder: index,
              })),
            }),
            byStartDateDesc,
          ),
        ),
      ),

    // The 201 echoes { id, name } only — not the row, and not the term ids the
    // assessment-period dialog uses as its <Select> values, which is what keeps a
    // refetch necessary here.
    //
    // Only this cache: a new year is not the current one, so the periods gate below
    // does not move, and holidays are attached to a year only by their own write.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.academicYears() });
    },

    onError: (_err, _data, context) => optimistic.rollback(context),
  });
}

export function useUpdateAcademicYear() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AcademicYearPayload> }) =>
      updateAcademicYear(id, payload),

    onMutate: ({ id, payload }) =>
      optimistic.patch<AcademicYear[]>({ queryKey: calendarKeys.academicYears() }, (current) =>
        patchList(current, (rows) =>
          // Re-sorted: startDate is the reader's ORDER BY, so an edit that moves a year
          // past another one has to move the card with it.
          sortRows(
            patchBy(
              rows,
              (year) => year.id === id,
              (year) => ({
                ...year,
                // The endpoint coalesces each field against the stored row, so an absent
                // key means "keep" here exactly as it does there.
                name: payload.name ?? year.name,
                startDate: payload.startDate ?? year.startDate,
                endDate: payload.endDate ?? year.endDate,
                // A body carrying terms makes the writer DELETE and re-INSERT the whole
                // set, so the surviving ids are new ones nothing echoes back.
                terms: payload.terms
                  ? payload.terms.map((term, index) => ({
                      id: optimisticId(),
                      ...term,
                      sortOrder: index,
                    }))
                  : year.terms,
              }),
            ),
            byStartDateDesc,
          ),
        ),
      ),

    // Still only this cache when terms were replaced: the periods read does not join
    // academic_terms (it selects on schoolId alone), so periods left pointing at a
    // deleted termId keep rendering exactly as they did.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.academicYears() });
    },

    onError: (_err, _vars, context) => optimistic.rollback(context),
  });
}

export function useDeleteAcademicYear() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (id: string) => deleteAcademicYear(id),

    onMutate: (id) =>
      optimistic.patch<AcademicYear[]>({ queryKey: calendarKeys.academicYears() }, (current) =>
        patchList(current, (rows) => removeBy(rows, (year) => year.id === id)),
      ),

    // Deleting a year reaches BOTH other caches, and neither reach can be derived here:
    //
    //   holidays -> holidays."academicYearId" is ON DELETE CASCADE, so that year's
    //               holidays go with it. Which rows those are is not knowable on the
    //               client — the reader returns academicYearId but the Holiday type
    //               drops it, so nothing in this cache can be attributed to a year.
    //   periods  -> the assessment-periods read is GATED on the school having a CURRENT
    //               year (CalendarReader: none -> []). Deleting the current year empties
    //               that panel without deleting a single assessment_periods row.
    //
    // Invalidating the year list alone — which is what this hook did before #89 — left
    // both of those panels showing rows the next fetch would have taken away.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.academicYears() });
      queryClient.invalidateQueries({ queryKey: calendarKeys.assessmentPeriods() });
      queryClient.invalidateQueries({ queryKey: calendarKeys.holidays() });
    },

    onError: (_err, _id, context) => optimistic.rollback(context),
  });
}

// ============================================
// Assessment Period Hooks
// ============================================

export function useAssessmentPeriods() {
  return useQuery({
    queryKey: calendarKeys.assessmentPeriods(),
    queryFn: getAssessmentPeriods,
    staleTime: 1000 * 60 * 30,
  });
}

export function useCreateAssessmentPeriod() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (data: AssessmentPeriodPayload) => createAssessmentPeriod(data),

    onMutate: (data) =>
      optimistic.patch<AssessmentPeriod[]>(
        { queryKey: calendarKeys.assessmentPeriods() },
        (current) =>
          patchList(current, (rows) =>
            sortRows(
              appendItem(rows, {
                id: optimisticId(),
                // `body.name || "Assessment Window"` — mirrored so a period created from
                // an empty name does not render blank for a beat.
                name: data.name || "Assessment Window",
                // An empty termId is resolved server-side to the current year's first
                // term, so it is carried through as sent rather than invented. Nothing
                // renders it; the settle corrects it.
                termId: data.termId,
                startDate: data.startDate,
                endDate: data.endDate,
                assessmentTypes: data.assessmentTypes,
              }),
              byStartDateAsc,
            ),
          ),
      ),

    // { id, name } again, and the endpoint 400s outright when the school has no term to
    // hang the period on — the row has to come back from the server either way.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.assessmentPeriods() });
    },

    onError: (_err, _data, context) => optimistic.rollback(context),
  });
}

export function useUpdateAssessmentPeriod() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AssessmentPeriodPayload> }) =>
      updateAssessmentPeriod(id, payload),

    onMutate: ({ id, payload }) =>
      optimistic.patch<AssessmentPeriod[]>(
        { queryKey: calendarKeys.assessmentPeriods() },
        (current) =>
          patchList(current, (rows) =>
            sortRows(
              patchBy(
                rows,
                (period) => period.id === id,
                (period) => ({
                  ...period,
                  name: payload.name ?? period.name,
                  termId: payload.termId ?? period.termId,
                  startDate: payload.startDate ?? period.startDate,
                  endDate: payload.endDate ?? period.endDate,
                  assessmentTypes: payload.assessmentTypes ?? period.assessmentTypes,
                }),
              ),
              byStartDateAsc,
            ),
          ),
      ),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.assessmentPeriods() });
    },

    onError: (_err, _vars, context) => optimistic.rollback(context),
  });
}

export function useDeleteAssessmentPeriod() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (id: string) => deleteAssessmentPeriod(id),

    onMutate: (id) =>
      optimistic.patch<AssessmentPeriod[]>(
        { queryKey: calendarKeys.assessmentPeriods() },
        (current) => patchList(current, (rows) => removeBy(rows, (period) => period.id === id)),
      ),

    // Periods hang off a term, and nothing else in these three caches reads them.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.assessmentPeriods() });
    },

    onError: (_err, _id, context) => optimistic.rollback(context),
  });
}

// ============================================
// Holiday Hooks
// ============================================

export function useHolidays() {
  return useQuery({
    queryKey: calendarKeys.holidays(),
    queryFn: getHolidays,
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * The writer's normalizeHolidayInput, mirrored so the optimistic rows are the ones that
 * actually come back: the name is trimmed and capped at 100 characters, and an entry
 * with an empty name or an unparseable date is DROPPED rather than stored.
 *
 * Mirroring the drop is the point. The endpoint answers 200 with a count either way, so
 * an entry shown for a row the server discarded would sit there looking saved until the
 * refetch quietly removed it, with no error anywhere.
 */
function normalizeHoliday(input: HolidayPayload["holidays"][number]): Holiday | undefined {
  const name = input.name.trim().slice(0, 100);
  if (!name) return undefined;
  if (Number.isNaN(Date.parse(input.date))) return undefined;
  return { id: optimisticId(), name, date: input.date, type: input.type };
}

export function useCreateHolidays() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (data: HolidayPayload) => createHolidays(data),

    // One write posts a batch, so this inserts every entry that survives normalisation.
    onMutate: (data) =>
      optimistic.patch<Holiday[]>({ queryKey: calendarKeys.holidays() }, (current) =>
        patchList(current, (rows) => {
          const pending = data.holidays
            .map(normalizeHoliday)
            .filter((holiday): holiday is Holiday => !!holiday);
          if (pending.length === 0) return undefined;
          return sortRows([...rows, ...pending], byDateAsc);
        }),
      ),

    // The response is { count }: no ids, and no way to tell WHICH entries were dropped
    // when the count comes back short. Both are what this settle is for.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.holidays() });
    },

    onError: (_err, _data, context) => optimistic.rollback(context),
  });
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (id: string) => deleteHoliday(id),

    onMutate: (id) =>
      optimistic.patch<Holiday[]>({ queryKey: calendarKeys.holidays() }, (current) =>
        patchList(current, (rows) => removeBy(rows, (holiday) => holiday.id === id)),
      ),

    // 404s for a holiday belonging to another school, which is what the rollback covers.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.holidays() });
    },

    onError: (_err, _id, context) => optimistic.rollback(context),
  });
}
