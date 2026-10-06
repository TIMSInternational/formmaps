/**
 * #409 — the Overview card must render the stored name verbatim (no
 * title-casing of "de"/"del"/"la"), and #394/#405 — the deadline renders as a
 * localized calendar date, not raw ISO and not shifted a day.
 */
// Real i18next (English by default) so assertions read the rendered copy.
import i18n from "@/lib/i18n";
import React from "react";
import { render, screen } from "@testing-library/react";
import { OverviewTab } from "../overview-tab";
import { ApplicationHeader } from "../application-header";
import type { TrackedApplication } from "@/services/applicationService";

jest.mock("motion/react", () => {
  const React = require("react");
  const strip = ({ initial, animate, exit, transition, layout, ...rest }: Record<string, unknown>) => rest;
  return {
    motion: { div: ({ children, ...p }: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement("div", strip(p), children) },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

const app = {
  id: "a1",
  name: "Universidad de Costa Rica - Medicina (Demo)",
  type: "university",
  location: "San José de la Montaña",
  column: "applying",
  deadline: "2026-12-15T00:00:00.000Z",
} as unknown as TrackedApplication;

function renderOverview() {
  return render(
    <OverviewTab app={app} notes="" notesDirty={false} savingNotes={false} onNotesChange={() => {}} onSaveNotes={() => {}} />,
  );
}

it("renders the application name and location verbatim (no capitalize transform)", () => {
  renderOverview();
  const name = screen.getByText("Universidad de Costa Rica - Medicina (Demo)");
  expect(name.className).not.toMatch(/\bcapitalize\b/);
  expect(screen.getByText("San José de la Montaña").className).not.toMatch(/\bcapitalize\b/);
});

it("translates the Type enum value (#405) and keeps it capitalized", () => {
  renderOverview();
  expect(screen.getByText("University").className).toMatch(/\bcapitalize\b/);
});

it("formats the deadline as a calendar date with no day shift", () => {
  renderOverview();
  expect(screen.getByText("Dec 15, 2026")).toBeInTheDocument();
  expect(screen.queryByText(/2026-12-15/)).toBeNull();
});

it("header shows the same formatted deadline", () => {
  render(<ApplicationHeader app={app} onBack={() => {}} />);
  expect(screen.getByText("Dec 15, 2026")).toBeInTheDocument();
});

it("formats the deadline in Spanish when the UI language is es", async () => {
  await i18n.changeLanguage("es");
  try {
    renderOverview();
    expect(screen.getByText("15 dic 2026")).toBeInTheDocument();
  } finally {
    await i18n.changeLanguage("en");
  }
});
