/** tafurfede/formmaps-platform#405: application detail read "TIPO: University" — the type value was the raw enum. */
import { render, screen, act } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { OverviewTab } from "../overview-tab";

jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: {
      div: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("div", { className }, children),
    },
  };
});

const app = {
  id: "a1",
  name: "Universidad de Costa Rica",
  type: "university",
  location: "San José",
  column: "researching",
} as unknown as Parameters<typeof OverviewTab>[0]["app"];

describe("OverviewTab type value i18n", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("translates the application type in Spanish", async () => {
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    render(
      <OverviewTab app={app} notes="" notesDirty={false} savingNotes={false} onNotesChange={jest.fn()} onSaveNotes={jest.fn()} />
    );
    expect(screen.getByText("Universidad")).toBeInTheDocument();
    expect(screen.queryByText("university")).not.toBeInTheDocument();
  });

  it("falls back to the raw value for an unknown type", () => {
    render(
      <OverviewTab app={{ ...app, type: "bootcamp" } as unknown as typeof app} notes="" notesDirty={false} savingNotes={false} onNotesChange={jest.fn()} onSaveNotes={jest.fn()} />
    );
    expect(screen.getByText("bootcamp")).toBeInTheDocument();
  });
});
