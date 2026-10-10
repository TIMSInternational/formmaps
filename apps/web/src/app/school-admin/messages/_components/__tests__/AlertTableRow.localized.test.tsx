/**
 * Audit F: a generated alert reads in the viewer's language (key + params in `details`); free text stays.
 */
import { render, screen } from "@testing-library/react";
import { Table, TableBody } from "@/components/ui/table";
import { AlertTableRow } from "../AlertTableRow";

jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const inst = createTestI18n("es");
  return { useTranslation: (ns?: string) => ({ t: inst.getFixedT(null, ns ?? "common"), i18n: inst }) };
});

const row = (alert: Record<string, unknown>) =>
  render(
    <Table><TableBody>
      <AlertTableRow alert={{ id: "a1", type: "low_gpa", priority: "high", status: "active", studentName: "Maya", ...alert }} isSelected={false} onToggleSelect={jest.fn()} onMarkRead={jest.fn()} onDismiss={jest.fn()} />
    </TableBody></Table>,
  );

describe("AlertTableRow message language", () => {
  it("renders a generated alert's message in Spanish", () => {
    row({ message: "GPA is 1.20 — below the 2.0 threshold.", details: JSON.stringify({ i18n: { key: "low_gpa", params: { gpa: "1.20" } } }) });
    expect(screen.getByText("El promedio es 1.20, por debajo del mínimo de 2.0.")).toBeInTheDocument();
    expect(screen.queryByText(/GPA is 1.20/)).toBeNull();
  });

  it("keeps a free-text alert exactly as written", () => {
    row({ type: "custom", message: "Llamar a la familia el lunes", details: null });
    expect(screen.getByText("Llamar a la familia el lunes")).toBeInTheDocument();
  });
});
