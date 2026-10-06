/**
 * #405 — an entry's date renders in the UI language and on the stored day
 * (no shift west of UTC; Jest runs pinned to America/New_York).
 */
import i18n from "@/lib/i18n";
import React from "react";
import { render, screen } from "@testing-library/react";
import { ServiceEntryCard } from "../ServiceEntryCard";
import type { CommunityServiceEntry } from "@/types/communityService";

jest.mock("motion/react", () => {
  const React = require("react");
  const strip = ({ initial, animate, exit, transition, layout, ...rest }: Record<string, unknown>) => rest;
  return {
    motion: { div: ({ children, ...p }: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement("div", strip(p), children) },
  };
});

const ENTRY = {
  id: "e1",
  organization: "Cruz Roja",
  description: "",
  hours: 4,
  date: "2026-10-01T00:00:00.000Z",
  status: "pending",
} as unknown as CommunityServiceEntry;

afterAll(() => i18n.changeLanguage("en"));

it.each([
  ["en", "Oct 1, 2026"],
  ["es", "1 oct 2026"],
])("renders the %s date on the stored day", async (lng, expected) => {
  await i18n.changeLanguage(lng);
  render(<ServiceEntryCard entry={ENTRY} index={0} onEdit={jest.fn()} onDelete={jest.fn()} deletingId={null} />);
  expect(screen.getByText(expected)).toBeInTheDocument();
});
