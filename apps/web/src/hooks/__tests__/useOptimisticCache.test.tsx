/**
 * useOptimisticCache.test.tsx — formmaps#89.
 *
 * This module is shared scaffolding for ~150 mutations, so a defect here is a defect
 * everywhere at once. What is pinned below is specifically the behaviour that is easy
 * to get subtly wrong and impossible to notice by clicking around:
 *
 *   - rollback restores the EXACT prior value, across every cache entry a patch touched
 *   - an entry that holds no data is never conjured into existence
 *   - an updater can decline per-entry, using the query key, so an insert does not land
 *     on page 3 of a list or inside a filter it does not belong to
 *   - the pure list transforms never mutate their input, because React Query compares
 *     by reference and an in-place write both renders nothing and corrupts the snapshot
 *     the rollback depends on
 */
import { QueryClient } from "@tanstack/react-query";
import {
  appendItem,
  createOptimisticCache,
  isOptimisticId,
  keyParams,
  optimisticId,
  patchBy,
  patchEnvelope,
  removeBy,
  upsertBy,
} from "../useOptimisticCache";

type Row = { id: string; label: string };
type Envelope = { data: Row[]; total: number; page: number };

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const envelope = (rows: Row[], page = 1): Envelope => ({ data: rows, total: rows.length, page });

describe("patch / rollback", () => {
  it("restores every touched entry to its exact prior value", async () => {
    const qc = client();
    qc.setQueryData(["notes", "s1", { page: 1 }], envelope([{ id: "a", label: "A" }]));
    qc.setQueryData(["notes", "s1", { page: 2 }], envelope([{ id: "b", label: "B" }], 2));
    const before1 = qc.getQueryData(["notes", "s1", { page: 1 }]);
    const before2 = qc.getQueryData(["notes", "s1", { page: 2 }]);

    const cache = createOptimisticCache(qc);
    const ctx = await cache.patch<Envelope>({ queryKey: ["notes", "s1"] }, (current) =>
      patchEnvelope(current, (rows) => patchBy(rows, () => true, (r) => ({ ...r, label: "X" }))),
    );

    // Both pages changed …
    expect(qc.getQueryData<Envelope>(["notes", "s1", { page: 1 }])!.data[0].label).toBe("X");
    expect(qc.getQueryData<Envelope>(["notes", "s1", { page: 2 }])!.data[0].label).toBe("X");

    cache.rollback(ctx);

    // … and both came back, not just the one the caller happened to name.
    expect(qc.getQueryData(["notes", "s1", { page: 1 }])).toEqual(before1);
    expect(qc.getQueryData(["notes", "s1", { page: 2 }])).toEqual(before2);
  });

  it("leaves an unrelated student's cache alone", async () => {
    const qc = client();
    qc.setQueryData(["notes", "s1", {}], envelope([{ id: "a", label: "A" }]));
    qc.setQueryData(["notes", "s2", {}], envelope([{ id: "z", label: "Z" }]));

    const cache = createOptimisticCache(qc);
    await cache.patch<Envelope>({ queryKey: ["notes", "s1"] }, (current) =>
      patchEnvelope(current, (rows) => removeBy(rows, () => true)),
    );

    expect(qc.getQueryData<Envelope>(["notes", "s2", {}])!.data).toHaveLength(1);
  });

  it("does not create a cache entry that was not already there", async () => {
    const qc = client();
    const cache = createOptimisticCache(qc);

    await cache.patch<Envelope>({ queryKey: ["notes", "s1"] }, () => envelope([{ id: "new", label: "N" }]));

    // Inventing one would flash a list containing only the row just added, which then
    // jumps as soon as the real fetch lands.
    expect(qc.getQueryData(["notes", "s1", {}])).toBeUndefined();
  });

  it("skips a registered query that has no data yet", async () => {
    const qc = client();
    // A query is registered but data-less while its first fetch is in flight, and
    // `patch` must skip it exactly as it skips a key that does not exist.
    //
    // Built through the cache directly on purpose: `setQueryData(key, undefined)` does
    // NOT register a query, so writing this test the obvious way tests nothing at all —
    // the key is simply absent and the guard never runs.
    const key = ["notes", "s1", {}];
    qc.getQueryCache().build(qc, { queryKey: key, queryHash: JSON.stringify(key) } as never);
    expect(qc.getQueriesData({ queryKey: ["notes", "s1"] })).toHaveLength(1);

    const cache = createOptimisticCache(qc);
    const ctx = await cache.patch<Envelope>({ queryKey: ["notes", "s1"] }, () =>
      envelope([{ id: "new", label: "N" }]),
    );

    expect(qc.getQueryData(key)).toBeUndefined();
    expect(() => cache.rollback(ctx)).not.toThrow();
  });

  it("cancels in-flight fetches before patching", async () => {
    const qc = client();
    const cancel = jest.spyOn(qc, "cancelQueries");
    const cache = createOptimisticCache(qc);

    await cache.patch<Envelope>({ queryKey: ["notes", "s1"] }, (c) => c);

    // Without this, a response already on the wire lands on top of the optimistic
    // value and silently undoes it a beat later.
    expect(cancel).toHaveBeenCalledWith({ queryKey: ["notes", "s1"] });
  });

  it("tolerates a rollback with no context", () => {
    const cache = createOptimisticCache(client());
    expect(() => cache.rollback(undefined)).not.toThrow();
  });
});

describe("per-entry decisions from the query key", () => {
  it("an insert can land on page 1 and skip the rest", async () => {
    const qc = client();
    qc.setQueryData(["notes", "s1", { page: 1 }], envelope([{ id: "a", label: "A" }]));
    qc.setQueryData(["notes", "s1", { page: 3 }], envelope([{ id: "c", label: "C" }], 3));

    const cache = createOptimisticCache(qc);
    await cache.patch<Envelope>({ queryKey: ["notes", "s1"] }, (current, key) => {
      if ((keyParams<{ page?: number }>(key).page ?? 1) !== 1) return undefined;
      return patchEnvelope(current, (rows) => appendItem(rows, { id: "new", label: "N" }));
    });

    expect(qc.getQueryData<Envelope>(["notes", "s1", { page: 1 }])!.data).toHaveLength(2);
    expect(qc.getQueryData<Envelope>(["notes", "s1", { page: 3 }])!.data).toHaveLength(1);
  });

  it("keyParams reads the trailing params object, and {} for a key without one", () => {
    expect(keyParams(["notes", "s1", { page: 2, type: "meeting" }])).toEqual({ page: 2, type: "meeting" });
    expect(keyParams(["notes", "s1"])).toEqual({});
    // A trailing array is a key segment, not params — treating it as params would read
    // its numeric indices as option names.
    expect(keyParams(["notes", ["a", "b"]])).toEqual({});
  });
});

describe("replace", () => {
  it("writes without snapshotting — there is nothing left to roll back to", () => {
    const qc = client();
    qc.setQueryData(["notes", "s1", {}], envelope([{ id: "tmp", label: "pending" }]));
    const cache = createOptimisticCache(qc);

    cache.replace<Envelope>({ queryKey: ["notes", "s1"] }, (current) => ({
      ...current,
      data: upsertBy(current.data, (r) => r.id === "tmp", { id: "real", label: "saved" }),
    }));

    expect(qc.getQueryData<Envelope>(["notes", "s1", {}])!.data).toEqual([
      { id: "real", label: "saved" },
    ]);
  });
});

describe("list transforms do not mutate their input", () => {
  // React Query compares by reference: an in-place edit renders nothing AND corrupts
  // the snapshot rollback relies on, so the bug shows up only when a request fails.
  const rows: Row[] = Object.freeze([
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ]) as Row[];

  it("appendItem", () => {
    expect(appendItem(rows, { id: "c", label: "C" })).toHaveLength(3);
    expect(rows).toHaveLength(2);
  });

  it("patchBy touches only matches and returns a new array", () => {
    const next = patchBy(rows, (r) => r.id === "a", (r) => ({ ...r, label: "Z" }));
    expect(next.map((r) => r.label)).toEqual(["Z", "B"]);
    expect(next).not.toBe(rows);
    expect(rows[0].label).toBe("A");
    // Unmatched rows keep their identity, so React skips re-rendering them.
    expect(next[1]).toBe(rows[1]);
  });

  it("removeBy", () => {
    expect(removeBy(rows, (r) => r.id === "a").map((r) => r.id)).toEqual(["b"]);
    expect(rows).toHaveLength(2);
  });

  it("upsertBy replaces on a match and appends when there is none", () => {
    expect(upsertBy(rows, (r) => r.id === "a", { id: "a", label: "Z" }).map((r) => r.label))
      .toEqual(["Z", "B"]);
    // The append branch is the one that matters: the optimistic row carries a
    // placeholder id, so matching on the SERVER id finds nothing and the real row
    // would be dropped instead of shown.
    expect(upsertBy(rows, (r) => r.id === "nope", { id: "c", label: "C" })).toHaveLength(3);
  });
});

describe("patchEnvelope", () => {
  it("moves total with the row count so the header agrees with the list", () => {
    const next = patchEnvelope(envelope([{ id: "a", label: "A" }]), (rows) =>
      appendItem(rows, { id: "b", label: "B" }),
    );
    expect(next).toMatchObject({ total: 2, page: 1 });
    expect(next.data).toHaveLength(2);
  });

  it("never drives total negative", () => {
    const next = patchEnvelope({ data: [] as Row[], total: 0 }, (rows) => rows);
    expect(next.total).toBe(0);
  });

  it("leaves fields it does not own untouched", () => {
    const next = patchEnvelope({ data: [] as Row[], total: 0, page: 4, totalPages: 9 }, (rows) =>
      appendItem(rows, { id: "a", label: "A" }),
    );
    expect(next).toMatchObject({ page: 4, totalPages: 9 });
  });
});

describe("placeholder ids", () => {
  it("are unique within the same millisecond", () => {
    // `Date.now()` alone collides on two rows added in one tick, which React's key
    // reconciliation then renders as a single row.
    const ids = new Set(Array.from({ length: 50 }, () => optimisticId()));
    expect(ids.size).toBe(50);
  });

  it("are recognisable, so a pending row is never mistaken for a persisted one", () => {
    expect(isOptimisticId(optimisticId())).toBe(true);
    expect(isOptimisticId("b3f1c2d4-0000-0000-0000-000000000000")).toBe(false);
    expect(isOptimisticId(undefined)).toBe(false);
  });
});
