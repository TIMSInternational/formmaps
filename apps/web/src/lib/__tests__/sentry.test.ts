import { scrubUrl, scrubEvent } from "@/lib/sentry";

/**
 * FormMaps URLs carry single-use secrets: student onboarding tokens, password-reset tokens, and
 * the 360-evaluator links a parent or teacher clicks to rate a named 16-year-old. Sentry attaches
 * the full URL to every event and every navigation breadcrumb, and this app had no `beforeSend`.
 * One uncaught exception on an invite page would have handed a third party a working credential
 * for a minor's account.
 *
 * The DSN is unset today. That is the only reason it has not happened, and it is one environment
 * variable away from being live.
 */

describe("scrubUrl", () => {
  it.each([
    [
      "a student onboarding token",
      "https://app.formmaps.com/onboarding/student?token=7f3a9c21e84b4d0fa1c6b2d5e8f0a3c7",
      "https://app.formmaps.com/onboarding/student?[redacted]",
    ],
    [
      "a password reset token",
      "https://app.formmaps.com/reset-password?token=abc123def456ghi789jkl012",
      "https://app.formmaps.com/reset-password?[redacted]",
    ],
    [
      "a 360 evaluator link",
      "https://app.formmaps.com/evaluation/respond?token=eyJhbGciOiJIUzI1NiJ9.abc.def&name=Mar%C3%ADa",
      "https://app.formmaps.com/evaluation/respond?[redacted]",
    ],
    [
      "a UUID in the path",
      "https://app.formmaps.com/dashboard/students/3f2504e0-4f89-11d3-9a0c-0305e82c3301/results",
      "https://app.formmaps.com/dashboard/students/[redacted]/results",
    ],
    [
      "a cuid in the path",
      "/api/v1/counselor/students/cl9ebqhxk00003b600tymydho/notes",
      "/api/v1/counselor/students/[redacted]/notes",
    ],
    ["a fragment", "https://app.formmaps.com/report#token=abc", "https://app.formmaps.com/report#[redacted]"],
  ])("redacts %s", (_label, input, expected) => {
    expect(scrubUrl(input)).toBe(expected);
  });

  it.each([
    ["a plain route", "https://app.formmaps.com/dashboard"],
    ["a nested route", "https://app.formmaps.com/dashboard/assessments/lia"],
    ["a relative route", "/counselor/sessions"],
  ])("leaves %s alone, so the report is still readable", (_label, input) => {
    expect(scrubUrl(input)).toBe(input);
  });

  it("keeps enough shape to place the error", () => {
    const scrubbed = scrubUrl("https://app.formmaps.com/onboarding/student?token=secret");

    expect(scrubbed).toContain("/onboarding/student");
    expect(scrubbed).toContain("?");
    expect(scrubbed).not.toContain("secret");
  });
});

describe("scrubEvent", () => {
  it("scrubs request.url and drops query_string", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.formmaps.com/onboarding/student?token=SECRET_TOKEN_VALUE",
        query_string: "token=SECRET_TOKEN_VALUE",
      },
    } as Record<string, unknown>);

    expect(JSON.stringify(event)).not.toContain("SECRET_TOKEN_VALUE");
    expect((event.request as { query_string?: string }).query_string).toBeUndefined();
  });

  it("scrubs the Referer header", () => {
    const event = scrubEvent({
      request: { headers: { Referer: "https://app.formmaps.com/reset-password?token=SECRET_TOKEN_VALUE" } },
    } as Record<string, unknown>);

    expect(JSON.stringify(event)).not.toContain("SECRET_TOKEN_VALUE");
  });

  it("scrubs breadcrumb data and messages, which is where navigation URLs live", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { message: "https://app.formmaps.com/evaluation/respond?token=SECRET_TOKEN_VALUE" },
        { data: { from: "/dashboard", to: "/onboarding/student?token=SECRET_TOKEN_VALUE" } },
        { data: { url: "/api/v1/student/3f2504e0-4f89-11d3-9a0c-0305e82c3301/profile", method: "GET" } },
      ],
    } as Record<string, unknown>);

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("SECRET_TOKEN_VALUE");
    expect(serialized).not.toContain("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(serialized).toContain("GET");
  });

  it("scrubs nested extra and contexts without flattening them", () => {
    const event = scrubEvent({
      extra: { attempt: 2, request: { url: "/reset-password?token=SECRET_TOKEN_VALUE" } },
      contexts: { page: { href: "/students/3f2504e0-4f89-11d3-9a0c-0305e82c3301" } },
    } as Record<string, unknown>);

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("SECRET_TOKEN_VALUE");
    expect(serialized).not.toContain("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect((event.extra as { attempt: number }).attempt).toBe(2);
  });

  it("does not mangle an event with nothing to scrub", () => {
    const event = scrubEvent({ message: "Something went wrong", level: "error" } as Record<string, unknown>);

    expect(event).toEqual({ message: "Something went wrong", level: "error" });
  });
});

describe("session replay", () => {
  it("is off on error, because the DOM here is a named minor's results", () => {
    const source = require("fs").readFileSync(require.resolve("@/lib/sentry"), "utf8") as string;

    expect(source).toMatch(/replaysOnErrorSampleRate:\s*0\s*,/);
    expect(source).not.toMatch(/replaysOnErrorSampleRate:\s*1/);
  });
});
