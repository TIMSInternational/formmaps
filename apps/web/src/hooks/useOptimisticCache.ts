"use client";

import { useMemo } from "react";
import {
  useQueryClient,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from "@tanstack/react-query";

/**
 * useOptimisticCache — the shared scaffolding behind formmaps#89.
 *
 * 151 of the app's 153 mutations were shaped the same way: fire the write, wait for
 * the response, invalidate, wait for the refetch. That is TWO sequential round trips
 * before the user sees anything change, and on this stack each one is itself two
 * database round trips (`api/src/lib/prisma.ts` wraps every model op in a
 * `$transaction([gucOp, query])` for RLS). The gradebook hooks were converted first
 * and proved the shape; this module is that shape, extracted, so the remaining hooks
 * do not each hand-roll it.
 *
 * `useGradebookQueries.ts` is the canonical consumer.
 *
 * The three rules this module exists to enforce:
 *
 *   1. CANCEL FIRST. A refetch already on the wire will otherwise land on top of the
 *      optimistic value and undo it a beat later.
 *   2. ROLL BACK FROM A SNAPSHOT, never from a refetch. A refetch on error is slower
 *      and, when the error was the network itself, may never resolve at all — leaving
 *      the user looking at a change that did not happen.
 *   3. NEVER INVENT A CACHE ENTRY. If nothing is cached for a key, the optimistic step
 *      is skipped for that key. Writing a synthetic list containing only the row just
 *      added flashes a one-item view that jumps as soon as the real fetch lands.
 *
 * Deliberately NOT handled here, because it has to be a per-hook judgement call:
 * server-computed derived values (GPA, credit totals, progress percentages, ranks).
 * Patch the rows the user is looking at and let the reconcile fix the derived numbers.
 * A confidently wrong GPA is worse than one that is 200ms stale.
 *
 * Concurrency caveat, inherited from React Query's documented pattern: if two writes
 * against the same key overlap, the second snapshots the first's optimistic value, so
 * a rollback of the first can discard the second's change. `onSettled` reconciliation
 * repairs it. Genuinely concurrent editing of one row is not a flow this app has.
 */

/** Every cache entry that a patch touched, paired with its pre-patch value. */
export type CacheSnapshot = ReadonlyArray<[QueryKey, unknown]>;

/** What `patch` hands to `onError` for rollback. Returned from `onMutate` as context. */
export interface OptimisticContext {
  snapshot: CacheSnapshot;
}

export interface OptimisticCache {
  /**
   * Cancel in-flight fetches for `filters`, snapshot every matching cache entry, and
   * apply `update` to each. Returns the context to hand back from `onMutate`.
   *
   * `filters` is a React Query filter, not a bare key, because several caches here are
   * keyed with a trailing params object (`[..., studentId, { page, limit, type }]`) and
   * a write has to patch every cached page, not just the one the caller happens to know
   * about. Pass `{ queryKey: [...] }` for the simple case — prefix matching applies.
   *
   * `update` receives the matched entry's KEY as well as its data, because "patch every
   * matching entry" is only right for edits and deletes. An INSERT belongs in some
   * cached pages and not others: a note lands at the top of page 1, so writing it into
   * a cached page 3 shows a row that will vanish on the next fetch, and writing it into
   * a list filtered to another note type shows a row that does not belong there at all.
   * Read the params off the key and decline.
   *
   * `update` returning `undefined` means "leave this entry alone", which is how a hook
   * declines — whether because of the above, or because the shape is not one it knows.
   */
  patch<T>(
    filters: QueryFilters,
    update: (current: T, key: QueryKey) => T | undefined,
  ): Promise<OptimisticContext>;

  /** Restore every entry captured by `patch`. Safe to call with an undefined context. */
  rollback(context: OptimisticContext | undefined): void;

  /**
   * Write into the cache WITHOUT snapshotting — for `onSuccess`, where the server has
   * returned the real entity and there is nothing left to roll back to.
   *
   * This is the half of #89 that removes the second round trip outright: when a write
   * endpoint returns the mutated row, replacing it in place means no invalidate and no
   * refetch at all. Only reach for `invalidateQueries` for the things the response does
   * NOT carry (server-derived totals, other views of the same data).
   */
  replace<T>(
    filters: QueryFilters,
    update: (current: T, key: QueryKey) => T | undefined,
  ): void;
}

export function createOptimisticCache(qc: QueryClient): OptimisticCache {
  const write = <T,>(
    filters: QueryFilters,
    update: (current: T, key: QueryKey) => T | undefined,
  ) => {
    // Iterated by hand rather than via `setQueriesData`, whose updater is handed the
    // data alone — and the key is exactly what an insert needs in order to skip the
    // pages it does not belong on.
    for (const [key] of qc.getQueriesData<T>(filters)) {
      qc.setQueryData<T>(key, (current) => {
        // Rule 3: an absent entry stays absent. A query can be registered and still
        // have no data (first load in flight), and that case must be skipped too.
        if (current === undefined) return current;
        return update(current, key) ?? current;
      });
    }
  };

  return {
    async patch(filters, update) {
      await qc.cancelQueries(filters);
      const snapshot = qc.getQueriesData(filters);
      write(filters, update);
      return { snapshot };
    },

    rollback(context) {
      if (!context) return;
      for (const [key, value] of context.snapshot) {
        // A snapshot value of `undefined` means the entry held no data when we looked,
        // so `write` skipped it and there is nothing to restore. Passing `undefined` to
        // setQueryData is a no-op anyway; skipping is just explicit about why.
        if (value !== undefined) qc.setQueryData(key, value);
      }
    },

    replace(filters, update) {
      write(filters, update);
    },
  };
}

export function useOptimisticCache(): OptimisticCache {
  const qc = useQueryClient();
  return useMemo(() => createOptimisticCache(qc), [qc]);
}

/**
 * The trailing params object that this app's list keys carry
 * (`[..., studentId, { page, limit, type }]`), or `{}` for a key without one.
 *
 * Use it from a `patch`/`replace` updater to decide whether an inserted row belongs in
 * the entry being visited. An absent `page` means page 1, which is how the hooks call
 * these queries when the caller passes no params at all.
 */
export function keyParams<P extends Record<string, unknown>>(key: QueryKey): Partial<P> {
  const last = key[key.length - 1];
  const isPlainObject = !!last && typeof last === "object" && !Array.isArray(last);
  return (isPlainObject ? last : {}) as Partial<P>;
}

// ── Placeholder ids for rows that do not exist on the server yet ────────────────

const OPTIMISTIC_ID_PREFIX = "optimistic-";
let optimisticCounter = 0;

/**
 * Id for a row that has been shown but not yet persisted.
 *
 * The prefix is load-bearing twice over: it makes an unpersisted row obvious in a
 * debugger, and it keeps any code that keys off ids from mistaking one for a server id
 * (a `DELETE /notes/optimistic-…` would 404 confusingly). The counter is there because
 * `Date.now()` alone collides when two rows are added inside the same millisecond,
 * which React's key reconciliation then renders as a single row.
 */
export function optimisticId(): string {
  optimisticCounter += 1;
  return `${OPTIMISTIC_ID_PREFIX}${Date.now()}-${optimisticCounter}`;
}

/** True for a row that is still in flight — use it to disable edit/delete affordances. */
export function isOptimisticId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(OPTIMISTIC_ID_PREFIX);
}

// ── Pure list transforms ────────────────────────────────────────────────────────
//
// Shared so that "update a row in a list" is written once rather than 148 times, and
// so every one of them is non-mutating — React Query compares by reference, and an
// in-place `rows[i] = …` renders nothing while quietly corrupting the snapshot the
// rollback depends on.

/** Append `item`. Kept as a function purely so call sites read the same as the others. */
export function appendItem<T>(rows: readonly T[], item: T): T[] {
  return [...rows, item];
}

/** Replace every row matching `match` with `change(row)`. */
export function patchBy<T>(
  rows: readonly T[],
  match: (row: T) => boolean,
  change: (row: T) => T,
): T[] {
  return rows.map((row) => (match(row) ? change(row) : row));
}

/** Drop every row matching `match`. */
export function removeBy<T>(rows: readonly T[], match: (row: T) => boolean): T[] {
  return rows.filter((row) => !match(row));
}

/**
 * Replace the row matching `match` with `item`, or append it when there is no match.
 *
 * The append branch is what makes this usable from `onSuccess`: the optimistic row was
 * inserted under a placeholder id, so a match on the SERVER id finds nothing and the
 * real row would silently vanish. Call it matching on the placeholder id.
 */
export function upsertBy<T>(rows: readonly T[], match: (row: T) => boolean, item: T): T[] {
  return rows.some(match) ? rows.map((row) => (match(row) ? item : row)) : [...rows, item];
}

/**
 * Apply `change` to the rows inside a `{ data, total, … }` list envelope — the shape
 * every paginated endpoint in this app returns — keeping `total` consistent when the
 * row count moves, so a "N entries" header does not disagree with the list under it for
 * the duration of the request.
 *
 * Generic over the ENVELOPE rather than over the row, so the row type is inferred from
 * the envelope the caller already has and `change`'s parameter arrives fully typed. A
 * `<T, E extends { data: T[] }>` signature would infer `T` as `unknown` here, because
 * nothing else in the call mentions it.
 */
export function patchEnvelope<E extends { data: unknown[]; total?: number }>(
  envelope: E,
  change: (rows: E["data"]) => E["data"],
): E {
  const before = envelope.data ?? ([] as unknown as E["data"]);
  const data = change(before);
  const delta = data.length - before.length;
  return {
    ...envelope,
    data,
    ...(typeof envelope.total === "number" ? { total: Math.max(0, envelope.total + delta) } : {}),
  };
}
