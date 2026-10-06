/**
 * #394 — date-only values must land on the stored calendar day in EVERY
 * timezone. Jest's globalSetup pins the whole run to America/New_York and a
 * test file cannot change its own TZ (see jest.global-setup.js), so the
 * multi-timezone cases transpile ../dates.ts and execute it in child Node
 * processes started with `TZ=America/Costa_Rica` and `TZ=Asia/Tokyo`.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";
import { toCalendarDay, localDayKey, formatDate, formatMonthYear } from "../dates";

const CASES = {
  plainDay: toCalendarDay("2026-12-15"),
  utcMidnightIso: toCalendarDay("2026-12-15T00:00:00Z"),
  utcMidnightMs: toCalendarDay("2026-12-15T00:00:00.000Z"),
  dateObjUtcMidnight: toCalendarDay(new Date("2026-12-15")),
  firstOfYear: toCalendarDay("2026-01-01T00:00:00.000Z"),
  enDate: formatDate("2026-12-15T00:00:00Z", "en"),
  esDate: formatDate("2026-12-15T00:00:00Z", "es"),
  enMonth: formatMonthYear("2024-02-01", "en"),
  esMonth: formatMonthYear("2024-02-01", "es"),
};

const EXPECTED = {
  plainDay: "2026-12-15",
  utcMidnightIso: "2026-12-15",
  utcMidnightMs: "2026-12-15",
  dateObjUtcMidnight: "2026-12-15",
  firstOfYear: "2026-01-01",
  enDate: "Dec 15, 2026",
  esDate: "15 dic 2026",
  enMonth: "Feb 2024",
  esMonth: "feb 2024",
};

/** Run the same CASES in a child process with the given TZ. */
function runUnderTz(tz: string): Record<string, string | null> {
  const src = fs.readFileSync(path.join(__dirname, "..", "dates.ts"), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dates-tz-"));
  const modPath = path.join(dir, "dates.cjs");
  fs.writeFileSync(modPath, js);
  const script = `
    const { toCalendarDay, formatDate, formatMonthYear } = require(${JSON.stringify(modPath)});
    const out = {
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offset: new Date("2026-12-15T00:00:00Z").getTimezoneOffset(),
      naiveLocalDay: new Date("2026-12-15").getDate(),
      plainDay: toCalendarDay("2026-12-15"),
      utcMidnightIso: toCalendarDay("2026-12-15T00:00:00Z"),
      utcMidnightMs: toCalendarDay("2026-12-15T00:00:00.000Z"),
      dateObjUtcMidnight: toCalendarDay(new Date("2026-12-15")),
      firstOfYear: toCalendarDay("2026-01-01T00:00:00.000Z"),
      enDate: formatDate("2026-12-15T00:00:00Z", "en"),
      esDate: formatDate("2026-12-15T00:00:00Z", "es"),
      enMonth: formatMonthYear("2024-02-01", "en"),
      esMonth: formatMonthYear("2024-02-01", "es"),
    };
    process.stdout.write(JSON.stringify(out));
  `;
  try {
    const stdout = execFileSync(process.execPath, ["-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    });
    return JSON.parse(stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("dates helper — in-process (America/New_York, pinned by globalSetup)", () => {
  it("returns the stored day for date-only and UTC-midnight values", () => {
    expect(CASES).toEqual(EXPECTED);
  });

  it("reads a local Date (calendar grid cell) with local getters", () => {
    expect(toCalendarDay(new Date(2026, 11, 15))).toBe("2026-12-15");
    expect(toCalendarDay(new Date(2026, 11, 15, 22, 30))).toBe("2026-12-15");
    expect(localDayKey(new Date(2026, 11, 15))).toBe("2026-12-15");
  });

  it("treats a month-only YYYY-MM value as the first of that month", () => {
    expect(toCalendarDay("2024-09")).toBe("2024-09-01");
    expect(formatMonthYear("2024-09", "en")).toBe("Sep 2024");
  });

  it("returns null / fallback for empty or invalid input", () => {
    expect(toCalendarDay(null)).toBeNull();
    expect(toCalendarDay(undefined)).toBeNull();
    expect(toCalendarDay("")).toBeNull();
    expect(toCalendarDay("not a date")).toBeNull();
    expect(toCalendarDay("2026-02-31")).toBeNull();
    expect(formatDate(null, "en")).toBe("—");
    expect(formatDate("garbage", "es", undefined, "")).toBe("");
  });

  it("accepts custom Intl options and falls back to en for an unknown locale", () => {
    expect(formatDate("2026-12-15", "en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }))
      .toBe("Tuesday, December 15, 2026");
    expect(formatDate("2026-12-15", "es", { weekday: "long", month: "long", day: "numeric", year: "numeric" }))
      .toBe("martes, 15 de diciembre de 2026");
    expect(formatDate("2026-12-15", undefined)).toBe("Dec 15, 2026");
  });
});

describe.each([
  ["America/Costa_Rica", 360],
  ["Asia/Tokyo", -540],
])("dates helper — child process with TZ=%s", (tz, offset) => {
  const out = runUnderTz(tz);

  it("actually runs in that timezone (sanity)", () => {
    expect(out.tz).toBe(tz);
    expect(out.offset).toBe(offset);
  });

  if (offset > 0) {
    it("proves the original bug exists here: naive local getDate() is a day early", () => {
      expect(out.naiveLocalDay).toBe(14);
    });
  }

  it("returns the stored calendar day and formats it without shifting", () => {
    const { tz: _tz, offset: _o, naiveLocalDay: _n, ...rest } = out;
    expect(rest).toEqual(EXPECTED);
  });
});
