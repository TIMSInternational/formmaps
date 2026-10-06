"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const SUPPORTED_LANGUAGES = ["en", "es"] as const;

/**
 * LanguageSync - Synchronizes the HTML lang attribute with i18n language
 *
 * This is important for:
 * - Screen readers to use correct pronunciation
 * - Search engines to understand page language
 * - Browser translation features
 *
 * WCAG 2.1 Success Criterion: 3.1.1 Language of Page (Level A)
 *
 * It also localizes the default browser-tab title: Next's static `metadata`
 * in app/layout.tsx is English-only, so in Spanish the tab kept reading
 * "FormMaps - Find your path. Shape your future." (#405). Page-specific
 * titles are left untouched.
 */
export function LanguageSync() {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Update the HTML lang attribute when language changes
    document.documentElement.lang = i18n.language;

    // Also update the dir attribute for RTL languages (future-proofing)
    const rtlLanguages = ["ar", "he", "fa", "ur"];
    document.documentElement.dir = rtlLanguages.includes(i18n.language) ? "rtl" : "ltr";
  }, [i18n.language]);

  useEffect(() => {
    const localized = i18n.t("meta.defaultTitle");
    const knownDefaults = SUPPORTED_LANGUAGES.map((lng) =>
      i18n.getFixedT(lng)("meta.defaultTitle")
    );
    const apply = () => {
      if (document.title !== localized && knownDefaults.includes(document.title)) {
        document.title = localized;
      }
    };
    apply();
    // Next.js rewrites <title> on client navigations — re-apply after it does.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [i18n, i18n.language]);

  // This is a side-effect only component, renders nothing
  return null;
}
