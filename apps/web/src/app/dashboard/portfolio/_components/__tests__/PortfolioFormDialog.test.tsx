import React from "react";
import { render, screen } from "@testing-library/react";
import { PortfolioFormDialog } from "../PortfolioFormDialog";
import { emptyPayload } from "../portfolioConfig";
import type { PortfolioItemPayload } from "@/types/portfolio";

// ── mocks ─────────────────────────────────────────────────────────────────────

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function buildPayload(overrides: Partial<PortfolioItemPayload> = {}): PortfolioItemPayload {
  return { ...emptyPayload, ...overrides };
}

function renderDialog(payload: PortfolioItemPayload) {
  return render(
    <PortfolioFormDialog
      open={true}
      onOpenChange={jest.fn()}
      editingItem={null}
      formData={payload}
      onFormDataChange={jest.fn()}
      onSubmit={jest.fn()}
      isPending={false}
    />,
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("PortfolioFormDialog", () => {
  it("renders the description character counter with the correct count", () => {
    renderDialog(buildPayload({ description: "hello world" }));
    expect(screen.getByText("11/150")).toBeInTheDocument();
  });

  it("renders the Hours/Week number input", () => {
    renderDialog(buildPayload());
    expect(screen.getByLabelText(/hours\/week/i)).toBeInTheDocument();
  });

  it("renders the Weeks/Year number input", () => {
    renderDialog(buildPayload());
    expect(screen.getByLabelText(/weeks\/year/i)).toBeInTheDocument();
  });

  it("renders the Activity Category select control", () => {
    renderDialog(buildPayload());
    expect(screen.getByLabelText(/activity category/i)).toBeInTheDocument();
  });
});
