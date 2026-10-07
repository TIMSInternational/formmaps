/**
 * Super Admin "act as a school": the API client sends X-Acting-School-Id (lib/actingSchool.ts).
 *
 * Pinned: sent ONLY by a Super Admin, ONLY from /school-admin pages, ONLY when a school was opened in this tab;
 * the raw-fetch downloads get the same header; signing out forgets the school. Both backends ignore the header
 * for every other role (formmaps-platform superadmin-acting-school.route.test.ts, .NET ActingSchoolTests.cs), so
 * the client rules are about not sending a school the user did not choose, not about security.
 */
import { apiClient, apiRequest, actingSchoolFetchHeaders } from "@/lib/api/apiClient";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  ACTING_SCHOOL_HEADER,
  clearActingSchool,
  getActingSchool,
  setActingSchool,
} from "@/lib/actingSchool";
import { clearTokens } from "@/services/tokenRefreshService";

jest.mock("@/hooks/useToast", () => ({
  toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn() },
}));

const SCHOOL = { id: "0edde974-5257-4178-b4cf-0006a463d225", name: "Country Day School" };

let sent: Record<string, unknown> | undefined;
const capture = (config: { headers: { toJSON?: () => Record<string, unknown> } & Record<string, unknown> }) => {
  sent = typeof config.headers.toJSON === "function" ? config.headers.toJSON() : config.headers;
  return Promise.resolve({ data: { success: true }, status: 200, statusText: "OK", headers: {}, config });
};

function signInAs(role: string) {
  useGlobalStore.setState((s) => ({ user: { ...s.user, role, isAuthenticated: true } }));
}

function at(path: string) {
  window.history.pushState({}, "", path);
}

describe("X-Acting-School-Id", () => {
  let originalAdapter: unknown;
  beforeAll(() => {
    originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = capture as never;
  });
  afterAll(() => {
    apiClient.defaults.adapter = originalAdapter as never;
  });
  beforeEach(() => {
    sent = undefined;
    clearActingSchool();
    signInAs("Super Admin");
    at("/school-admin/users");
  });

  it("a Super Admin inside an opened school sends that school", async () => {
    setActingSchool(SCHOOL);
    await apiRequest("/api/v1/school-admin/students");
    expect(sent?.[ACTING_SCHOOL_HEADER]).toBe(SCHOOL.id);
  });

  it("legacy role spellings normalise the same way the layout does ('admin' is the Super Admin)", async () => {
    signInAs("admin");
    setActingSchool(SCHOOL);
    await apiRequest("/api/v1/school-admin/students");
    expect(sent?.[ACTING_SCHOOL_HEADER]).toBe(SCHOOL.id);
  });

  it("is not sent from /admin pages — the platform admin stays platform-wide", async () => {
    setActingSchool(SCHOOL);
    at("/admin/users");
    await apiRequest("/api/v1/admin/users");
    expect(sent?.[ACTING_SCHOOL_HEADER]).toBeUndefined();
  });

  it("a lookalike path is not a school-admin page", async () => {
    setActingSchool(SCHOOL);
    at("/school-administration");
    await apiRequest("/api/v1/whatever");
    expect(sent?.[ACTING_SCHOOL_HEADER]).toBeUndefined();
  });

  it("is not sent before a school is opened", async () => {
    await apiRequest("/api/v1/school-admin/students");
    expect(sent?.[ACTING_SCHOOL_HEADER]).toBeUndefined();
  });

  it.each(["school_admin", "counselor", "student"])("is never sent by a %s, even with a stale school in the tab", async (role) => {
    setActingSchool(SCHOOL);
    signInAs(role);
    await apiRequest("/api/v1/school-admin/students");
    expect(sent?.[ACTING_SCHOOL_HEADER]).toBeUndefined();
  });

  it("raw-fetch downloads carry the same header, and only for a Super Admin inside a school", () => {
    setActingSchool(SCHOOL);
    expect(actingSchoolFetchHeaders()).toEqual({ [ACTING_SCHOOL_HEADER]: SCHOOL.id });
    signInAs("school_admin");
    expect(actingSchoolFetchHeaders()).toEqual({});
  });

  it("signing out (every path goes through clearTokens) forgets the opened school", () => {
    setActingSchool(SCHOOL);
    clearTokens();
    expect(getActingSchool()).toBeNull();
  });
});

describe("the acting-school store", () => {
  beforeEach(() => clearActingSchool());

  it("round-trips id and name in this tab's sessionStorage", () => {
    setActingSchool(SCHOOL);
    expect(getActingSchool()).toEqual(SCHOOL);
    // Never in localStorage, which every tab shares.
    const shared = Object.keys(window.localStorage).map((k) => window.localStorage.getItem(k) ?? "").join("|");
    expect(shared).not.toContain(SCHOOL.id);
    expect(window.sessionStorage.getItem("formmaps.actingSchool")).toContain(SCHOOL.id);
  });

  it("ignores a corrupt or id-less entry instead of throwing", () => {
    window.sessionStorage.setItem("formmaps.actingSchool", "{not json");
    expect(getActingSchool()).toBeNull();
    window.sessionStorage.setItem("formmaps.actingSchool", JSON.stringify({ name: "No id" }));
    expect(getActingSchool()).toBeNull();
  });
});
