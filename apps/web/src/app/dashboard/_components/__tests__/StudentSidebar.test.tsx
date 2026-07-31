/**
 * Task 10 — "Herramientas"/Tools nav restructure.
 *
 * The old `nav.tools` group mixed document builders (Resume Builder, Portfolio)
 * with read-only records (Applications, Test Scores, Transcript,
 * Recommendations, Community Service). This asserts the split into
 * `nav.buildTools` / `nav.myRecords`.
 *
 * Canonical resume entry (decided via live browser repro, see PR body):
 * `/dashboard/resume-builder` (bare route) is a client-side redirect-only
 * stub — `resume-builder/page.tsx` does `router.replace("/dashboard/resumes")`
 * with the comment "Redirects to the My Resumes page which is the entry point
 * for resume management." So the sidebar links directly to
 * `/dashboard/resumes` (skipping the pointless extra redirect hop); the real
 * wizard tree is reached from there via `/dashboard/resume-builder/[id]` and
 * `/dashboard/resume-builder/new`.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({
    user: { name: "Test Student" },
    logout: jest.fn(),
    assessmentActive: false,
  }),
}));

jest.mock("@/contexts/AdminThemeContext", () => ({
  useAdminTheme: () => ({
    mode: "light",
    setMode: jest.fn(),
    colors: {
      bg: { hover: "#eee", active: "#ddd", overlay: "#fff", cardHover: "#f5f5f5" },
      border: { light: "#eee", hover: "#ddd", default: "#ccc", panel: "#eee" },
      font: { primary: "#111", secondary: "#333", tertiary: "#666", sectionLabel: "#999", light: "#aaa" },
    },
  }),
}));

jest.mock("@/hooks/useSubscription", () => ({
  useIsSchoolStudent: () => false,
}));

jest.mock("@/components/ai-chat/ChatContext", () => ({
  useChat: () => ({
    threads: [],
    currentThreadId: null,
    createThread: jest.fn(),
    selectThread: jest.fn(),
  }),
}));

jest.mock("@/components/side-panel/SidePanel", () => ({
  useSidePanel: () => ({ openPanel: jest.fn() }),
}));

jest.mock("@/components/ai-chat/AIChatPanel", () => ({
  AIChatSidePanel: () => null,
}));

jest.mock("@/components/ai-chat/useChatThreads", () => ({
  groupThreadsByDate: () => [],
  formatThreadTime: () => "",
}));

import { StudentSidebar } from "../StudentSidebar";

function linkHrefFor(label: string): string | null {
  const el = screen.getByText(label);
  const link = el.closest("a");
  return link?.getAttribute("href") ?? null;
}

describe("StudentSidebar — Tools nav restructure (Task 10)", () => {
  it("renders a nav.buildTools group and a nav.myRecords group (no combined nav.tools group)", () => {
    render(<StudentSidebar />);
    expect(screen.getByText("nav.buildTools")).toBeInTheDocument();
    expect(screen.getByText("nav.myRecords")).toBeInTheDocument();
    expect(screen.queryByText("nav.tools")).not.toBeInTheDocument();
  });

  it("puts Resume Builder and Portfolio under nav.buildTools, pointing resume builder at the real entry point /dashboard/resumes", () => {
    render(<StudentSidebar />);
    // /dashboard/resume-builder (bare) is a redirect-only stub to /dashboard/resumes
    // (see router.replace in resume-builder/page.tsx) — link directly, skip the hop.
    expect(linkHrefFor("dashboard.resumeBuilder")).toBe("/dashboard/resumes");
    expect(linkHrefFor("dashboard.portfolio")).toBe("/dashboard/portfolio");
  });

  it("never links to the bare /dashboard/resume-builder redirect stub from the sidebar", () => {
    render(<StudentSidebar />);
    const allLinks = screen.getAllByRole("link");
    const hrefs = allLinks.map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("/dashboard/resume-builder");
  });

  it("puts Applications, Test Scores, Transcript, Recommendations, and Community Service under nav.myRecords", () => {
    render(<StudentSidebar />);
    expect(linkHrefFor("nav.applications")).toBe("/dashboard/applications");
    expect(linkHrefFor("nav.testScores")).toBe("/dashboard/test-scores");
    expect(linkHrefFor("nav.transcript")).toBe("/dashboard/transcript");
    expect(linkHrefFor("nav.recommendations")).toBe("/dashboard/recommendations");
    expect(linkHrefFor("nav.communityService")).toBe("/dashboard/community-service");
  });

  it("does not link anywhere to the orphaned applications/calendar route from the sidebar", () => {
    render(<StudentSidebar />);
    const allLinks = screen.getAllByRole("link");
    const hrefs = allLinks.map((l) => l.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("applications/calendar"))).toBe(false);
  });
});
