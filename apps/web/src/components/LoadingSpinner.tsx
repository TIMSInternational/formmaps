// The ONE loading screen for auth/portal transitions. Login → portal used to
// flash 2-3 unrelated designs (indigo gradient → dark "Verifying access..." →
// student-shaped skeleton); every full-screen wait now shows this brand frame.
"use client";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

const noopSubscribe = () => () => {};

export function LoadingSpinner({
  overlay = false,
  label,
}: {
  overlay?: boolean;
  label?: string;
} = {}) {
  const { t: tDetected, i18n } = useTranslation();
  // The root layout server-renders this spinner, where i18next has no localStorage/navigator and
  // resolves to English; the browser's first render already has the detected language (e.g. "es").
  // Render the hydration pass in English so it matches the server HTML, then switch.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const t = hydrated ? tDetected : i18n.getFixedT("en");
  return (
    <div
      className={`${overlay ? "fixed inset-0 z-[9999]" : "min-h-screen"} flex items-center justify-center bg-white`}
      role="status"
      aria-busy="true"
      aria-label={label || t("components.loadingSpinner.loading")}
    >
      <div className="flex flex-col items-center gap-5">
        {/* Small FormMaps icon mark for the loading/splash frame. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fm-icon.png" alt="FormMaps" className="h-12 w-auto" />
        <div
          className="w-8 h-8 border-[3px] rounded-full animate-spin"
          style={{ borderColor: "#E5EAF0", borderTopColor: "var(--admin-accent-blue)" }}
          aria-hidden="true"
        />
        {label && (
          <p className="text-sm font-medium" style={{ color: "#6b7280" }} aria-hidden="true">
            {label}
          </p>
        )}
        <span className="sr-only">{t("components.loadingSpinner.pleaseWait")}</span>
      </div>
    </div>
  );
}
