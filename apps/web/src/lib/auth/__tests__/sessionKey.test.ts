import { nextSessionKey, type SessionKeyState } from "../sessionKey";

const anon: SessionKeyState = { id: null, generation: 0 };

describe("nextSessionKey — remount only when a signed-in identity ends or changes", () => {
  it("anonymous → signed in (login, signup, accepting an invite) keeps the key", () => {
    expect(nextSessionKey(anon, "u1")).toEqual({ id: "u1", generation: 0 });
  });
  it("logout bumps it", () => {
    expect(nextSessionKey({ id: "u1", generation: 0 }, null)).toEqual({ id: null, generation: 1 });
    expect(nextSessionKey({ id: "u1", generation: 0 }, undefined)).toEqual({ id: null, generation: 1 });
  });
  it("one account → another bumps it", () => {
    expect(nextSessionKey({ id: "u1", generation: 3 }, "u2")).toEqual({ id: "u2", generation: 4 });
  });
  it("is idempotent for the same identity (a repeated render cannot bump twice)", () => {
    const s = { id: "u1", generation: 2 };
    expect(nextSessionKey(s, "u1")).toBe(s);
    expect(nextSessionKey(anon, null)).toBe(anon);
  });
  it("logout then a different login: one bump, at logout", () => {
    let s = nextSessionKey(anon, "a");       // gen 0
    s = nextSessionKey(s, null);              // gen 1 — A's state discarded here
    s = nextSessionKey(s, "b");               // gen 1 — nothing of A left to discard
    expect(s).toEqual({ id: "b", generation: 1 });
  });
});
