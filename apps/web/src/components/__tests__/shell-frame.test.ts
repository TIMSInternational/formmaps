import { readFileSync } from "node:fs";
import { join } from "node:path";
import { colorsDark, colorsLight } from "@/styles/tokens";

/**
 * The frame -- the sidebar rail and the ground around the panel -- is navy in light theme
 * (Frame A, signed off 9/23). It is a contract between two files per role: the layout paints the
 * ground (`<AppShell frame>`) and the sidebar colours its text from `colors.frame`. Either half
 * alone is broken: a framed ground under a panel-coloured sidebar puts navy text on navy, and a
 * frame-coloured sidebar on the cream ground puts near-white text on cream.
 */

const SRC = join(process.cwd(), "src");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

const SHELLS: [layout: string, sidebar: string][] = [
  ["admin", "admin/_components/AdminSidebar.tsx"],
  ["careers", "dashboard/_components/StudentSidebar.tsx"],
  ["counselor", "counselor/_components/CounselorSidebar.tsx"],
  ["dashboard", "dashboard/_components/StudentSidebar.tsx"],
  ["dashboard/coaching", "dashboard/coaching/_components/CoachSidebar.tsx"],
  ["parent", "parent/_components/ParentSidebar.tsx"],
  ["school-admin", "school-admin/_components/SchoolAdminSidebar.tsx"],
  ["teacher", "teacher/_components/TeacherSidebar.tsx"],
];

describe.each(SHELLS)("%s", (layout, sidebar) => {
  it("paints the framed ground", () => {
    expect(read("app", ...layout.split("/"), "layout.tsx")).toMatch(/<AppShell[\s\S]*?\bframe\b[\s\S]*?>/);
  });

  it("colours its rail from the frame tokens", () => {
    expect(read("app", ...sidebar.split("/"))).toMatch(/themeColors\.frame/);
  });

  it("does not carry an active teal pill, which is 2.52:1 on navy", () => {
    // The chat empty-state CTA may keep the accent; only the nav's active state is banned.
    const code = read("app", ...sidebar.split("/"));
    expect(code).not.toMatch(/active \? "var\(--admin-accent-blue\)"/);
  });
});

describe("frame tokens", () => {
  it("light and dark define the same keys, so a sidebar never reads undefined", () => {
    expect(Object.keys(colorsLight.frame).sort()).toEqual(Object.keys(colorsDark.frame).sort());
  });

  it("light is the signed-off navy", () => {
    expect(colorsLight.frame.ground).toBe("#102B47");
  });
});
