"use client";

import React from "react";

/**
 * SkipLink - Accessible skip-to-content link for keyboard users
 * 
 * This component provides a way for keyboard users to bypass
 * navigation and jump directly to the main content.
 * 
 * WCAG 2.1 Success Criterion: 2.4.1 Bypass Blocks (Level A)
 */
export function SkipLink() {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const main = document.getElementById("main-content");
    if (main) {
      main.focus();
      main.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <a
      href="#main-content"
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all"
    >
      Skip to main content
    </a>
  );
}

/**
 * VisuallyHidden - Helper component for screen reader only content
 * 
 * Use this to provide additional context for screen reader users
 * without affecting the visual layout.
 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
}

/**
 * LiveRegion - Announces dynamic content changes to screen readers
 * 
 * WCAG 2.1 Success Criterion: 4.1.3 Status Messages (Level AA)
 */
interface LiveRegionProps {
  children: React.ReactNode;
  mode?: "polite" | "assertive";
  atomic?: boolean;
}

export function LiveRegion({ 
  children, 
  mode = "polite", 
  atomic = true 
}: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={mode}
      aria-atomic={atomic}
      className="sr-only"
    >
      {children}
    </div>
  );
}
