"use client";

import { useConsent } from "@/hooks/useConsent";
import { Switch } from "@/components/ui/switch";
import { Cookie, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";

const BRAND = "#065292";
const BRAND_DARK = "#04406f";

/**
 * GDPR cookie consent — centered, blocking modal pop-up (FormMaps brand).
 * Stays mounted over a dimmed/blurred backdrop until the user makes a choice.
 * Bilingual via i18n; all consent logic lives in useConsent.
 */
export function CookieConsentBanner() {
  const { t } = useTranslation();
  const { showBanner, acceptAll, acceptNecessaryOnly, setConsent, consent } = useConsent();
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const acceptRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog when it appears (a11y).
  useEffect(() => {
    if (showBanner) acceptRef.current?.focus();
  }, [showBanner]);

  if (!showBanner || consent) return null;

  const savePreferences = () =>
    setConsent({ necessary: true, analytics, marketing: false });

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-modal-title"
        aria-describedby="cookie-modal-desc"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {/* Dimmed, blurred backdrop — non-dismissible (must choose) */}
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-hidden="true" />

        <motion.div
          className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
        >
          {/* Yellow brand accent strip */}
          <div className="h-1.5 w-full" style={{ backgroundColor: "#FFD600" }} />

          <div className="px-6 pb-6 pt-7 sm:px-8">
            {/* Icon */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
              style={{ background: `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})` }}>
              <Cookie className="h-7 w-7 text-white" aria-hidden="true" />
            </div>

            <h2 id="cookie-modal-title" className="text-center text-xl font-bold text-[#111111]">
              {t("cookieConsent.title", "We value your privacy")}
            </h2>
            <p id="cookie-modal-desc" className="mt-2 text-center text-sm leading-relaxed text-gray-600">
              {t(
                "cookieConsent.description",
                "We use cookies and similar technologies to improve your experience, analyze traffic, and personalize content.",
              )}{" "}
              <Link href="/privacy" className="font-medium hover:underline" style={{ color: BRAND }}>
                {t("cookieConsent.privacyPolicy", "Privacy Policy")}
              </Link>
            </p>

            {/* Customize panel */}
            <AnimatePresence initial={false}>
              {showDetails && (
                <motion.div
                  className="mt-5 space-y-2.5 overflow-hidden"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Necessary — always on */}
                  <CategoryRow
                    icon={<ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                    title={t("cookieConsent.necessaryTitle", "Necessary")}
                    desc={t("cookieConsent.necessaryDesc", "Required for the site to function. Cannot be disabled.")}
                    badge={t("cookieConsent.alwaysOn", "Always On")}
                  />
                  {/* Analytics — toggleable */}
                  <CategoryRow
                    icon={<Sparkles className="h-4 w-4" style={{ color: BRAND }} aria-hidden="true" />}
                    title={t("cookieConsent.analyticsTitle", "Analytics")}
                    desc={t("cookieConsent.analyticsDesc", "Help us understand how you use the platform so we can improve it.")}
                    control={
                      <Switch
                        checked={analytics}
                        onCheckedChange={setAnalytics}
                        aria-label={t("cookieConsent.analyticsTitle", "Analytics")}
                        className="data-[state=checked]:bg-[#065292]"
                      />
                    }
                  />
                  {/* Marketing — not used */}
                  <CategoryRow
                    icon={<Cookie className="h-4 w-4 text-gray-400" aria-hidden="true" />}
                    title={t("cookieConsent.marketingTitle", "Marketing")}
                    desc={t("cookieConsent.marketingDesc", "We don't currently use marketing or third-party advertising cookies.")}
                    badge={t("cookieConsent.notUsed", "Not used")}
                    muted
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="mt-6 space-y-2.5">
              <button
                ref={acceptRef}
                onClick={acceptAll}
                className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors"
                style={{ backgroundColor: BRAND }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_DARK)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND)}
              >
                {t("cookieConsent.acceptAll", "Accept All")}
              </button>

              <div className="flex gap-2.5">
                {showDetails ? (
                  <button
                    onClick={savePreferences}
                    className="flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-slate-50"
                    style={{ borderColor: BRAND, color: BRAND }}
                  >
                    {t("cookieConsent.savePreferences", "Save Preferences")}
                  </button>
                ) : (
                  <button
                    onClick={acceptNecessaryOnly}
                    className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-slate-50"
                  >
                    {t("cookieConsent.necessaryOnly", "Necessary Only")}
                  </button>
                )}
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-slate-50"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  {t("cookieConsent.customize", "Customize")}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function CategoryRow({
  icon,
  title,
  desc,
  badge,
  control,
  muted,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  control?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-xl bg-slate-50 p-3 ${muted ? "opacity-60" : ""}`}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {badge && (
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-gray-500">{desc}</p>
      </div>
      {control && <div className="flex-shrink-0 self-center">{control}</div>}
    </div>
  );
}
