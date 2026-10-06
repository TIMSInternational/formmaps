/**
 * #399 — students with no school never see the school-only entries
 * (Transcript, Video, Book Counselor, Recommendations); school students do.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

let mockUser: Record<string, unknown> = {};
jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({
    user: mockUser,
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
      frame: {
        ground: "#102B47", textStrong: "#fff", textIdle: "#ccc", label: "#999", icon: "#999",
        hover: "#123", selected: "#234", activeBg: "#1E3C5C", activeText: "#fff", activeIcon: "#7FBEC4",
        brandAccent: "#7FBEC4", avatar: "#1E3C5C", control: "#1E3C5C", controlBorder: "#2A4463",
        divider: "#2A4463", panelBorder: "transparent",
      },
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

const SCHOOL_ONLY = ["/dashboard/transcript", "/dashboard/video", "/dashboard/book-counselor", "/dashboard/recommendations"];
const hrefs = () => screen.getAllByRole("link").map((l) => l.getAttribute("href"));

describe("StudentSidebar — school-only entries (#399)", () => {
  it("hides them for an independent student (no school), keeping everything else", () => {
    mockUser = { name: "Indie", role: "student", schoolId: null, isAuthenticated: true };
    render(<StudentSidebar />);
    for (const h of SCHOOL_ONLY) expect(hrefs()).not.toContain(h);
    expect(screen.queryByText("nav.transcript")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.videoCalls")).not.toBeInTheDocument();
    expect(hrefs()).toContain("/dashboard/test-scores");
    expect(hrefs()).toContain("/dashboard/messages");
  });

  it("keeps them for a school student", () => {
    mockUser = { name: "School", role: "student", schoolId: "school-1", isAuthenticated: true };
    render(<StudentSidebar />);
    expect(hrefs()).toContain("/dashboard/transcript");
    expect(hrefs()).toContain("/dashboard/video");
    expect(hrefs()).toContain("/dashboard/recommendations");
  });

  it("keeps them while the school is still unknown (schoolId not loaded yet)", () => {
    mockUser = { name: "Loading", role: "student", isAuthenticated: true };
    render(<StudentSidebar />);
    expect(hrefs()).toContain("/dashboard/transcript");
  });
});
