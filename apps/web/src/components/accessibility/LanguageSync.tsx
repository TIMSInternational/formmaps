"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * LanguageSync - Synchronizes the HTML lang attribute with i18n language
 * 
 * This is important for:
 * - Screen readers to use correct pronunciation
 * - Search engines to understand page language
 * - Browser translation features
 * 
 * WCAG 2.1 Success Criterion: 3.1.1 Language of Page (Level A)
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

  // This is a side-effect only component, renders nothing
  return null;
}
