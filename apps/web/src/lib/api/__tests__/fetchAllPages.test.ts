import { fetchAllPages, API_PAGE_MAX } from "@/lib/api/fetchAllPages";

const pages = (total: number, size = API_PAGE_MAX) => jest.fn((page: number, limit: number) => {
  const start = (page - 1) * limit;
  const rows = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => start + i);
  return Promise.resolve({ rows, totalPages: Math.ceil(total / size) });
});

describe("fetchAllPages (audit 2026-10-09 D4)", () => {
  it("walks every page of 100 until the last one", async () => {
    const fetchPage = pages(250);
    const rows = await fetchAllPages(fetchPage);
    expect(rows).toHaveLength(250);
    expect(new Set(rows).size).toBe(250);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(fetchPage.mock.calls.every((c) => c[1] === 100)).toBe(true);
  });

  it("stops after one request when everything fits on the first page", async () => {
    const fetchPage = pages(40);
    expect(await fetchAllPages(fetchPage)).toHaveLength(40);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops at the reported last page even when it is full", async () => {
    const fetchPage = pages(200);
    expect(await fetchAllPages(fetchPage)).toHaveLength(200);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("works without totalPages by stopping at a short page", async () => {
    const fetchPage = jest.fn((page: number) => Promise.resolve({ rows: page < 3 ? Array(100).fill(page) : [3] }));
    expect(await fetchAllPages(fetchPage)).toHaveLength(201);
  });

  it("is bounded by maxPages", async () => {
    const fetchPage = jest.fn(() => Promise.resolve({ rows: Array(100).fill(0) }));
    expect(await fetchAllPages(fetchPage, { maxPages: 3 })).toHaveLength(300);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});
