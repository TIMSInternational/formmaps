/**
 * Audit D12: Settings → School information shows the real contract period (the API never returned
 * contractStart/contractEnd, so it read " - ").
 */
import { render, screen } from "@testing-library/react";
import SettingsPage from "../page";
import { useSchoolSettings } from "@/hooks/useSchoolAdmin";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, d?: unknown) => (typeof d === "string" ? d : d && typeof d === "object" && "timezone" in d ? `${k}:${(d as { timezone: string }).timezone}` : k),
  }),
}));
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/hooks/useSchoolAdmin", () => ({ useSchoolSettings: jest.fn() }));
jest.mock("@/services/schoolAdminService", () => ({ updateAdminProfile: jest.fn(), changePassword: jest.fn() }));
jest.mock("@/app/school-admin/_components/AdminTabBar", () => ({ AdminTabBar: () => null }));

const mockSettings = useSchoolSettings as jest.Mock;
const base = { admin: { id: "a", name: "Admin", email: "a@s.test" } };

describe("contract period", () => {
  it("shows the contract days and the zone they count in", () => {
    mockSettings.mockReturnValue({
      data: { ...base, school: { id: "s", name: "Country Day", maxStudents: 500, currentStudents: 3, contractStart: "2026-01-01", contractEnd: "2027-06-30", timezone: "America/New_York" } },
      isLoading: false, refetch: jest.fn(),
    });
    render(<SettingsPage />);
    const period = screen.getByTestId("contract-period");
    expect(period).toHaveTextContent(/2026/);
    expect(period).toHaveTextContent(/2027/);
    expect(period).toHaveTextContent(/30/); // the end day itself, never shifted a day by the viewer's zone
    expect(screen.getByText("schoolAdmin.settings.schoolInfo.contractDays:America/New_York")).toBeInTheDocument();
  });

  it("says it is not set instead of rendering an empty dash", () => {
    mockSettings.mockReturnValue({
      data: { ...base, school: { id: "s", name: "FormMaps", maxStudents: 500, currentStudents: 3, contractStart: null, contractEnd: null, timezone: "America/Bogota" } },
      isLoading: false, refetch: jest.fn(),
    });
    render(<SettingsPage />);
    expect(screen.getByTestId("contract-period")).toHaveTextContent("schoolAdmin.settings.schoolInfo.noContract");
  });
});
