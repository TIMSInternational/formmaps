import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { apiRequest } from "@/lib/api/apiClient";

/**
 * Single-source language setter for the platform.
 *
 * Returns a stable callback (lang: "en" | "es") => Promise<void> that:
 *   1. Updates i18next (triggers UI re-render everywhere).
 *   2. Updates the Zustand global store (persisted preference).
 *   3. Persists to the backend via PUT /api/v1/user/settings.
 *
 * The PUT is fire-and-forget: network errors are suppressed so the UI
 * change is never blocked by a slow/failed API call.
 *
 * Loop-guard: I18nProvider already syncs i18next→store on the
 * `languageChanged` event, but only when the values differ. Because
 * we update the store here BEFORE i18next fires `languageChanged`,
 * the handler in I18nProvider will see identical values and skip its
 * own setLanguage call — no loop.
 */
export function useSetLanguage(): (lang: "en" | "es") => Promise<void> {
  const { i18n } = useTranslation();
  const setLanguage = useGlobalStore((s) => s.setLanguage);

  return useCallback(
    async (lang: "en" | "es") => {
      const storeValue = lang === "es" ? "spanish" : "english";

      // 1. Update store first (loop-guard: I18nProvider's languageChanged
      //    handler will find values already equal and skip its setLanguage).
      setLanguage(storeValue);

      // 2. Update i18next (triggers UI re-render).
      await i18n.changeLanguage(lang);

      // 3. Persist to backend — fire-and-forget.
      apiRequest("/api/v1/user/settings", {
        method: "PUT",
        data: { language: lang },
      }).catch(() => {
        // Silently ignore network errors — UI preference is already applied.
      });
    },
    [i18n, setLanguage]
  );
}
