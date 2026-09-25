import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Three small things the app already had and was not using.
 *
 * 1. MOBILE. Only dashboard/layout.tsx passed `sidebarClassName="hidden md:block"`. The other six
 *    shells rendered a fixed 220px sidebar at every width, leaving ~131px of usable content at
 *    375px. Counselors, school admins, teachers, admins -- and PARENTS, who are the most likely
 *    of all of them to open this on a phone.
 * 2. SKIP LINK. `SkipToMain` existed in TWO duplicate modules, imported by nothing, while the
 *    `#main-content` target it jumps to was already rendered by the shell. Keyboard users had to
 *    tab the whole sidebar on every page.
 * 3. CHART TOKENS. `--chart-1..5` were defined correctly with ZERO consumers; every chart
 *    hardcoded its own hexes, so the palette could not be themed from one place.
 */

const SRC = join(process.cwd(), "src");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

const SHELL_LAYOUTS = [
  "admin", "counselor", "dashboard", "dashboard/coaching", "parent", "school-admin", "teacher",
];

describe("mobile", () => {
  it.each(SHELL_LAYOUTS)("%s hides the sidebar below the md breakpoint", (name) => {
    expect(read("app", ...name.split("/"), "layout.tsx"))
      .toMatch(/sidebarClassName=\{?["'`]hidden md:block/);
  });

  it("covers every layout that renders the shell, with none missed", () => {
    // Guards the list above against a new shell layout being added and quietly not covered.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const found = execSync(`grep -rl "<AppShell" ${join(SRC, "app")} || true`, { encoding: "utf8" })
      .split("\n").filter(Boolean).length;

    expect(found).toBe(SHELL_LAYOUTS.length);
  });
});

describe("the skip link", () => {
  const shell = read("components", "layout", "AppShell.tsx");

  it("is mounted in the shell", () => {
    expect(shell).toMatch(/<SkipToMain\s*\/>/);
  });

  it("is imported from the module that exports it", () => {
    expect(shell).toMatch(/import \{ SkipToMain \} from "@\/components\/ui\/accessibility"/);
    expect(read("components", "ui", "accessibility.tsx")).toMatch(/export function SkipToMain/);
  });

  it("jumps to a target the shell actually renders", () => {
    expect(shell).toMatch(/id="main-content"/);
  });
});

describe("chart colours", () => {
  const CHART_FILES = [
    ["app", "admin", "_components", "TelemetryCharts.tsx"],
    ["app", "dashboard", "transcript", "page.tsx"],
    ["components", "dashboard", "CareerMatches.tsx"],
  ] as const;

  it.each(CHART_FILES.map((f) => [f.join("/"), f] as const))(
    "%s uses the chart tokens rather than brand hex literals",
    (_name, parts) => {
      const source = read(...parts);
      const literals = source.match(/(?:fill|stroke|color)="#(?:2E9098|10B981|FFD23F|EF4444|102B47)"/gi) ?? [];

      expect(literals).toEqual([]);
      expect(source).toMatch(/var\(--chart-[1-5]\)/);
    },
  );

  it("the tokens those charts now reference are defined", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    for (const n of [1, 2, 3, 4, 5]) {
      expect(css).toMatch(new RegExp(`--chart-${n}:\\s*#`));
    }
  });
});
