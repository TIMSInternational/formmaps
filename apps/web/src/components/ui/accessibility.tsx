"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * Skip to Main Content Link
 * 
 * Provides keyboard users a way to skip repetitive navigation and go directly to main content.
 * This is a WCAG 2.1 Level A requirement (2.4.1 Bypass Blocks).
 * 
 * Usage: Add this component at the top of your layout, before the header/nav.
 */
export function SkipToMain({ mainId = "main-content" }: { mainId?: string }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const { t } = useTranslation();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const mainElement = document.getElementById(mainId);
    if (mainElement) {
      mainElement.focus();
      mainElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <a
      ref={linkRef}
      href={`#${mainId}`}
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-md focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-600"
    >
      {t("accessibility.skipToContent")}
    </a>
  );
}

/**
 * Visually Hidden component for screen reader only content
 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
}

/**
 * Live Region for dynamic announcements
 * Use this to announce changes to screen readers.
 */
export function LiveRegion({
  children,
  politeness = "polite",
}: {
  children: React.ReactNode;
  politeness?: "polite" | "assertive";
}) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {children}
    </div>
  );
}
