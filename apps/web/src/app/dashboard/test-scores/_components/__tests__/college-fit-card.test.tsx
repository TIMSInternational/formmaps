import React from "react";
import { render, screen } from "@testing-library/react";
import { CollegeFitCard } from "../college-fit-card";
import type { CollegeFitResult } from "@/services/testScoreService";

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
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

const baseCollege = {
  id: "col-1",
  name: "MIT",
  city: "Cambridge",
  state: "MA",
  sat25: 1510,
  sat75: 1580,
  fit: "reach" as const,
};

describe("CollegeFitCard", () => {
  it("renders '8% admit' when acceptanceRate is 0.08", () => {
    const result: CollegeFitResult = {
      superscore: 1500,
      colleges: [{ ...baseCollege, acceptanceRate: 0.08 }],
    };
    render(<CollegeFitCard result={result} />);
    expect(screen.getByText(/8% admit/)).toBeInTheDocument();
    expect(screen.queryByText(/0% admit/)).not.toBeInTheDocument();
  });

  it("renders 'Admit rate N/A' (not '0% admit') when acceptanceRate is null", () => {
    const result: CollegeFitResult = {
      superscore: 1500,
      colleges: [{ ...baseCollege, acceptanceRate: null }],
    };
    render(<CollegeFitCard result={result} />);
    expect(screen.getByText(/Admit rate N\/A/)).toBeInTheDocument();
    expect(screen.queryByText(/0% admit/)).not.toBeInTheDocument();
  });
});
