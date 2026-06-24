import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortfolioItemCard } from "../PortfolioItemCard";
import type { PortfolioItem } from "@/types/portfolio";

// ── mocks ─────────────────────────────────────────────────────────────────────

// motion/react — render children immediately, strip motion-only props.
jest.mock("motion/react", () => {
  const React = require("react");
  const MOTION_PROPS = new Set([
    "layout", "layoutId", "initial", "animate", "exit", "transition",
    "variants", "whileHover", "whileTap", "whileFocus", "whileDrag",
    "whileInView", "drag", "dragConstraints", "dragElastic",
    "onAnimationStart", "onAnimationComplete", "onDragStart", "onDragEnd",
  ]);
  function stripMotionProps(props: Record<string, unknown>) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!MOTION_PROPS.has(k)) clean[k] = v;
    }
    return clean;
  }
  return {
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
        React.createElement("div", stripMotionProps(props), children),
    },
  };
});

// ── fixtures ──────────────────────────────────────────────────────────────────

const ITEM: PortfolioItem = {
  id: "p1",
  studentId: "s1",
  type: "extracurricular",
  title: "Chess Club",
  description: "Weekly chess matches and tournaments.",
  startDate: "2024-09",
  isCurrent: true,
  attachments: [],
  createdAt: "2024-09-01T00:00:00Z",
  updatedAt: "2024-09-01T00:00:00Z",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function renderCard(onEdit = jest.fn(), onDelete = jest.fn()) {
  return render(
    <PortfolioItemCard item={ITEM} index={0} onEdit={onEdit} onDelete={onDelete} />,
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("PortfolioItemCard", () => {
  afterEach(() => jest.restoreAllMocks());

  it("exposes an edit button queryable by aria-label", () => {
    renderCard();
    expect(screen.getByLabelText(/edit/i)).toBeInTheDocument();
  });

  it("exposes a delete button queryable by aria-label", () => {
    renderCard();
    expect(screen.getByLabelText(/delete/i)).toBeInTheDocument();
  });

  it("calls onEdit when the edit button is clicked", () => {
    const onEdit = jest.fn();
    renderCard(onEdit);
    fireEvent.click(screen.getByLabelText(/edit/i));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(ITEM);
  });

  it("does NOT call onDelete when delete is clicked and confirm returns false", () => {
    const onDelete = jest.fn();
    jest.spyOn(window, "confirm").mockReturnValue(false);
    renderCard(jest.fn(), onDelete);
    fireEvent.click(screen.getByLabelText(/delete/i));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("calls onDelete with the item id when delete is clicked and confirm returns true", () => {
    const onDelete = jest.fn();
    jest.spyOn(window, "confirm").mockReturnValue(true);
    renderCard(jest.fn(), onDelete);
    fireEvent.click(screen.getByLabelText(/delete/i));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("p1");
  });
});
