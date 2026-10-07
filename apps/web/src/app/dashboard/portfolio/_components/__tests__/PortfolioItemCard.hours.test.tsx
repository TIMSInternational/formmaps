/**
 * #403 — the card shows hours derived from Hours/Week × Weeks/Year when no
 * total was typed, and a localized month-year range instead of raw ISO dates.
 */
import i18n from "@/lib/i18n";
import React from "react";
import { render, screen } from "@testing-library/react";
import { PortfolioItemCard } from "../PortfolioItemCard";
import type { PortfolioItem } from "@/types/portfolio";

jest.mock("motion/react", () => {
  const React = require("react");
  const strip = ({ initial, animate, exit, transition, layout, whileHover, ...rest }: Record<string, unknown>) => rest;
  return {
    motion: { div: ({ children, ...p }: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement("div", strip(p), children) },
  };
});

const VOLUNTEER: PortfolioItem = {
  id: "v1",
  studentId: "s1",
  type: "volunteer",
  title: "Cruz Roja",
  description: "",
  startDate: "2024-02-01",
  isCurrent: true,
  totalHours: 0,
  hoursPerWeek: 4,
  weeksPerYear: 40,
  attachments: [],
  createdDate: "2024-02-01T00:00:00Z",
  updatedAt: "2024-02-01T00:00:00Z",
};

const renderCard = (item: PortfolioItem) =>
  render(<PortfolioItemCard item={item} index={0} onEdit={jest.fn()} onDelete={jest.fn()} />);

afterEach(() => i18n.changeLanguage("en"));

describe("PortfolioItemCard — hours and date range (#403)", () => {
  it("shows hours derived from Hours/Week × Weeks/Year when total is 0", () => {
    renderCard(VOLUNTEER);
    expect(screen.getByText(/160\s+hrs/)).toBeInTheDocument();
  });

  it("a typed total wins over the derived product", () => {
    renderCard({ ...VOLUNTEER, totalHours: 25 });
    expect(screen.getByText(/25\s+hrs/)).toBeInTheDocument();
  });

  it("does not render a stray 0 when there are no hours at all", () => {
    const { container } = renderCard({ ...VOLUNTEER, hoursPerWeek: undefined, weeksPerYear: undefined });
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("renders a localized month-year range instead of ISO dates", () => {
    renderCard({ ...VOLUNTEER, isCurrent: false, endDate: "2025-06-30T00:00:00.000Z" });
    expect(screen.getByText(/Feb 2024\s+–\s+Jun 2025/)).toBeInTheDocument();
    expect(screen.queryByText(/2024-02-01/)).toBeNull();
  });

  it("shows Present for an open-ended item", () => {
    renderCard(VOLUNTEER);
    expect(screen.getByText(/Feb 2024\s+–\s+Present/)).toBeInTheDocument();
  });

  it("renders the range and hours in Spanish", async () => {
    await i18n.changeLanguage("es");
    renderCard(VOLUNTEER);
    expect(screen.getByText(/feb 2024\s+–\s+Actualidad/)).toBeInTheDocument();
    expect(screen.getByText(/160\s+h\b/)).toBeInTheDocument();
  });
});
