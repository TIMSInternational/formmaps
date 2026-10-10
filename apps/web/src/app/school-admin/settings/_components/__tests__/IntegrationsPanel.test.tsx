/**
 * audit 2026-10-09 C17: "Test connection" must call the real iSAMS test endpoint and show its
 * verdict; a failed save must not say "saved" and must never put the API key in browser storage.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IntegrationsPanel from "../IntegrationsPanel";
import { saveIsamsConfig, getIsamsStatus, testIsamsConnection } from "@/services/isamsService";
import { toast } from "sonner";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock("@/hooks/useSchoolAdminAccess", () => ({ useSchoolAdminAccess: () => ({ schoolId: "school-1" }) }));
jest.mock("@/services/isamsService", () => ({
  saveIsamsConfig: jest.fn(),
  getIsamsStatus: jest.fn(),
  triggerIsamsSync: jest.fn(),
  testIsamsConnection: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockSave = saveIsamsConfig as jest.Mock;
const mockStatus = getIsamsStatus as jest.Mock;
const mockTest = testIsamsConnection as jest.Mock;

function fill(endpoint: string, key: string) {
  fireEvent.change(screen.getByPlaceholderText("https://api.isams.cloud/v1"), { target: { value: endpoint } });
  fireEvent.change(screen.getByPlaceholderText("settings.integrationsPanel.apiKeyPlaceholder"), { target: { value: key } });
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  mockStatus.mockResolvedValue({ configured: false, enabled: false, connected: false, lastSyncAt: null });
});

function storageDump() {
  const all: string[] = [];
  for (const s of [sessionStorage, localStorage]) for (let i = 0; i < s.length; i++) all.push(s.getItem(s.key(i)!) ?? "");
  return all.join("|");
}

it("Test connection calls the real test endpoint and shows success", async () => {
  mockTest.mockResolvedValue({ connected: true, message: "Connected successfully" });
  render(<IntegrationsPanel />);
  fill("https://isams.example.com", "secret-key");
  fireEvent.click(screen.getByText("settings.integrationsPanel.testConnection"));
  await waitFor(() => expect(mockTest).toHaveBeenCalledWith("school-1", { endpoint: "https://isams.example.com", apiKey: "secret-key" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("settings.integrationsPanel.connectionSuccess"));
  expect(mockStatus).toHaveBeenCalledTimes(1); // only the on-mount load, not used as a fake "test"
});

it("Test connection shows the server's failure message", async () => {
  mockTest.mockResolvedValue({ connected: false, message: "401 Unauthorized" });
  render(<IntegrationsPanel />);
  fill("https://isams.example.com", "bad-key");
  fireEvent.click(screen.getByText("settings.integrationsPanel.testConnection"));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("settings.integrationsPanel.failedCheck", { description: "401 Unauthorized" }));
  expect(toast.success).not.toHaveBeenCalled();
});

it("a failed save says it failed and stores nothing", async () => {
  mockSave.mockRejectedValue(new Error("500"));
  render(<IntegrationsPanel />);
  fill("https://isams.example.com", "secret-key");
  fireEvent.click(screen.getByText("settings.integrationsPanel.save"));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("settings.integrationsPanel.configSaveFailed"));
  expect(toast.success).not.toHaveBeenCalled();
  expect(storageDump()).toBe("");
});

it("a successful save never writes the API key to browser storage", async () => {
  mockSave.mockResolvedValue({ success: true });
  render(<IntegrationsPanel />);
  fill("https://isams.example.com", "secret-key");
  fireEvent.click(screen.getByText("settings.integrationsPanel.save"));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("settings.integrationsPanel.configSaved"));
  expect(storageDump()).toContain("https://isams.example.com");
  expect(storageDump()).not.toContain("secret-key");
});
