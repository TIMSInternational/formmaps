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
  const { language, setLanguage, user } = useGlobalStore();

  // On mount: seed i18next from the persisted store value (works offline / before
  // any DB fetch). If the user is authenticated, fetch their saved settings from
  // the DB and apply them — this ensures cross-device language sync.
  useEffect(() => {
    const storedI18nCode = language === "spanish" ? "es" : "en";

    const applyLanguage = (code: "en" | "es") => {
      const storeValue = code === "es" ? "spanish" : "english";
      // Guard: only update store when value actually differs (loop-guard).
      if (language !== storeValue) {
        setLanguage(storeValue);
      }
      // Guard: only call changeLanguage when i18n isn't already on this code.
      if (i18n.language !== code) {
        i18n.changeLanguage(code).catch(() => {});
      }
    };

    const ensureInit = async () => {
      // 1. Apply persisted store value immediately so the UI doesn't flash raw keys.
      applyLanguage(storedI18nCode);

      // 2. If authenticated, fetch the DB-persisted language and override if different.
      if (user.isAuthenticated) {
        try {
          const { apiRequest } = await import("@/lib/api/apiClient");
          const res = await apiRequest("/api/v1/user/settings");
          const dbLang: string | undefined = res?.data?.language ?? res?.language;
          if (dbLang === "es" || dbLang === "spanish") {
            applyLanguage("es");
          } else if (dbLang === "en" || dbLang === "english") {
            applyLanguage("en");
          }
        } catch {
          // Best-effort: DB fetch failed, keep the store value.
        }
      }

      setIsLoaded(true);
    };

    if (i18n.isInitialized) {
      ensureInit();
    } else {
      const onInit = () => { ensureInit(); };
      i18n.on("initialized", onInit);
      const t = setTimeout(() => ensureInit(), 1500);
      return () => {
        i18n.off("initialized", onInit);
        clearTimeout(t);
      };
    }
  // Only re-run when auth status changes (login/logout). Language changes
  // are handled by useSetLanguage + the languageChanged listener below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.isAuthenticated]);

  // Keep store in sync when i18next language changes via any path.
  // Loop-guard: useSetLanguage sets the store BEFORE calling changeLanguage,
  // so by the time this fires the store already has the correct value and
  // the `language !== globalStoreLanguage` check will skip the redundant set.
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
