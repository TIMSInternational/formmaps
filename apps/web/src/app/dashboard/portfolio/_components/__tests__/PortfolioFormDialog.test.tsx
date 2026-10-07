import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortfolioFormDialog } from "../PortfolioFormDialog";
import { emptyPayload } from "../portfolioConfig";
import type { PortfolioItemPayload } from "@/types/portfolio";

// ── mocks ─────────────────────────────────────────────────────────────────────

// Real i18next (English) so assertions read the rendered copy, not raw keys.
import "@/lib/i18n";

// ── helpers ───────────────────────────────────────────────────────────────────

function buildPayload(overrides: Partial<PortfolioItemPayload> = {}): PortfolioItemPayload {
  return { ...emptyPayload, ...overrides };
}

function renderDialog(
  payload: PortfolioItemPayload,
  onFormDataChange: jest.Mock = jest.fn(),
) {
  return render(
    <PortfolioFormDialog
      open={true}
      onOpenChange={jest.fn()}
      editingItem={null}
      formData={payload}
      onFormDataChange={onFormDataChange}
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

  it("preserves a typed 0 in number inputs (does not collapse to undefined)", () => {
    const onFormDataChange = jest.fn();
    renderDialog(buildPayload(), onFormDataChange);
    fireEvent.change(screen.getByLabelText(/hours\/week/i), { target: { value: "0" } });
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({ hoursPerWeek: 0 }),
    );
    onFormDataChange.mockClear();
    fireEvent.change(screen.getByLabelText(/weeks\/year/i), { target: { value: "0" } });
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({ weeksPerYear: 0 }),
    );
  });

  it("clears a number input to undefined when emptied", () => {
    const onFormDataChange = jest.fn();
    renderDialog(buildPayload({ hoursPerWeek: 5 }), onFormDataChange);
    fireEvent.change(screen.getByLabelText(/hours\/week/i), { target: { value: "" } });
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({ hoursPerWeek: undefined }),
    );
  });

  it("renders the Activity Category select control", () => {
    renderDialog(buildPayload());
    expect(screen.getByLabelText(/activity category/i)).toBeInTheDocument();
  });
});

// ── #403: Total hours auto-fills from Hours/Week × Weeks/Year ─────────────────

function StatefulDialog({ initial }: { initial: PortfolioItemPayload }) {
  const [data, setData] = React.useState(initial);
  return (
    <PortfolioFormDialog
      open={true}
      onOpenChange={jest.fn()}
      editingItem={null}
      formData={data}
      onFormDataChange={setData}
      onSubmit={jest.fn()}
      isPending={false}
    />
  );
}

describe("PortfolioFormDialog — total hours auto-fill (#403)", () => {
  const total = () => screen.getByLabelText(/total hours/i) as HTMLInputElement;

  it("fills Total = Hours/Week × Weeks/Year when the student has not typed a total", () => {
    render(<StatefulDialog initial={buildPayload({ type: "volunteer" })} />);
    fireEvent.change(screen.getByLabelText(/hours\/week/i), { target: { value: "4" } });
    expect(total().value).toBe("");
    fireEvent.change(screen.getByLabelText(/weeks\/year/i), { target: { value: "40" } });
    expect(total().value).toBe("160");
    // keeps following while untouched
    fireEvent.change(screen.getByLabelText(/hours\/week/i), { target: { value: "5" } });
    expect(total().value).toBe("200");
  });

  it("never overwrites a total the student typed", () => {
    render(<StatefulDialog initial={buildPayload({ type: "volunteer" })} />);
    fireEvent.change(screen.getByLabelText(/hours\/week/i), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/weeks\/year/i), { target: { value: "40" } });
    fireEvent.change(total(), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/weeks\/year/i), { target: { value: "50" } });
    expect(total().value).toBe("120");
  });
});
