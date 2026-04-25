"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { SkipLink } from "@/components/accessibility/AccessibilityHelpers";
import { LanguageSync } from "@/components/accessibility/LanguageSync";
import "../lib/i18n";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const { i18n } = useTranslation();
  const { language, setLanguage } = useGlobalStore();

  useEffect(() => {
    // Ensure i18n is initialized before rendering children to avoid showing raw keys
    const storedLanguage = language;
    const i18nLanguage = storedLanguage === "spanish" ? "es" : "en";

    const ensureInit = () => {
      try {
        if (i18n.language !== i18nLanguage) {
          i18n.changeLanguage(i18nLanguage);
        }
      } catch (err) {
        // ignore
      }
      setIsLoaded(true);
    };

    if (i18n.isInitialized) {
      ensureInit();
    } else {
      const onInit = () => ensureInit();
      i18n.on("initialized", onInit);
      // Fallback: if initialization doesn't fire for some reason, mark loaded after short timeout
      const t = setTimeout(() => ensureInit(), 1500);
      return () => {
        i18n.off("initialized", onInit);
        clearTimeout(t);
      };
    }
  }, [i18n, language]);

  // Listen for i18n language changes and sync to global store
  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      const globalStoreLanguage = lng === "es" ? "spanish" : "english";
      if (language !== globalStoreLanguage) {
        setLanguage(globalStoreLanguage);
      }
    };

    i18n.on("languageChanged", handleLanguageChange);

    return () => {
      i18n.off("languageChanged", handleLanguageChange);
    };
  }, [i18n, language, setLanguage]);

  if (!isLoaded) {
    return <>{children}</>;
  }

  return (
    <>
      <SkipLink />
      <LanguageSync />
      {children}
    </>
  );
}

