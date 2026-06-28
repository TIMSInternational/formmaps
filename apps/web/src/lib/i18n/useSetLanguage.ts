import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { apiRequest } from "@/lib/api/apiClient";
import i18nInstance from "@/lib/i18n";

/**
 * Write-free language application — safe to call during mount-time hydration.
 *
 * Does ONLY:
 *   1. Updates the Zustand global store (persisted preference).
 *   2. Updates i18next (triggers UI re-render everywhere).
 *
 * Does NOT PUT to the backend. Use this when the value came FROM the DB
 * (e.g. Settings page mount) so the page load never echoes back a redundant write.
 *
 * Loop-guard: store is written BEFORE i18next fires `languageChanged`, so
 * I18nProvider's handler will see equal values and skip its own setLanguage.
 */
export function applyLanguage(lang: "en" | "es"): void {
  const storeValue = lang === "es" ? "spanish" : "english";
  const store = useGlobalStore.getState();
  // Guard: only update store when value actually differs.
  if (store.language !== storeValue) {
    store.setLanguage(storeValue);
  }
  // Guard: only call changeLanguage when i18n isn't already on this code.
  if (i18nInstance.language !== lang) {
    i18nInstance.changeLanguage(lang).catch(() => {});
  }
}

/**
 * Single-source language setter for user-initiated language changes.
 *
 * Returns a stable callback (lang: "en" | "es") => Promise<void> that:
 *   1. Updates the Zustand global store (persisted preference).
 *   2. Updates i18next (triggers UI re-render everywhere).
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
