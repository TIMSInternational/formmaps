import normalizeSessions, { isUpcoming, isPast } from "@/lib/normalizeSessions";

describe("normalizeSessions", () => {
  test("handles array response", () => {
    const raw = [
      { id: "1", status: "confirmed", start: "2099-01-01T10:00:00Z" },
      { id: "2", status: "completed", start: "2000-01-01T10:00:00Z" },
    ];
    const out = normalizeSessions(raw);
    expect(out).toHaveLength(2);
    expect(out[0].startTime).toBeInstanceOf(Date);
    expect(out[1].status).toBe("completed");
  });

  test("handles {data:[]} shape", () => {
    const raw = { data: [{ id: "1", status: "confirmed", startTime: "2099-01-01T10:00:00Z" }] };
    const out = normalizeSessions(raw);
    expect(out).toHaveLength(1);
    expect(out[0].startTime).toBeInstanceOf(Date);
  });

  test("handles {data:{data:[]}} shape", () => {
    const raw = { data: { data: [{ id: "1", status: "confirmed", start: "2099-01-01T10:00:00Z" }] } };
    const out = normalizeSessions(raw);
    expect(out).toHaveLength(1);
    expect(out[0].startTime).toBeInstanceOf(Date);
  });

  test("classification helpers", () => {
    const future = normalizeSessions([{ id: "1", status: "confirmed", start: "2099-01-01T10:00:00Z" }])[0];
    const past = normalizeSessions([{ id: "2", status: "completed", start: "2000-01-01T10:00:00Z" }])[0];

    expect(isUpcoming(future, new Date("2025-01-01").getTime())).toBe(true);
    expect(isPast(past, Date.now())).toBe(true);
  });
});
