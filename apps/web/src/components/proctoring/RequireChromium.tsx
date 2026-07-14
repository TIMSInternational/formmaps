"use client";

/**
 * Browser gate for proctored assessments. Multi-monitor enforcement relies on
 * Chromium's `screen.isExtended`, which Firefox/Safari do not implement — so a
 * proctored runner is only trustworthy in Chrome/Edge. Unsupported browsers get
 * a blocking card instead of the assessment.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Pure UA test for a Chromium-based browser (Chrome / Edge / Chromium).
 * Firefox and Safari are treated as unsupported. Exported for unit testing.
 */
export function isChromium(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): boolean {
  if (!ua) return false;
  // Edge (Chromium) reports "Edg/"; Chrome/Chromium report "Chrome/"/"Chromium/".
  const isChromeFamily = /\bEdg\//.test(ua) || /\bChrome\//.test(ua) || /\bChromium\//.test(ua);
  // Firefox never ships Chrome; guard against spoofed UAs that mix the tokens.
  const isFirefox = /\bFirefox\//.test(ua);
  return isChromeFamily && !isFirefox;
}

export function RequireChromium({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // null = not yet determined (SSR / first paint). Avoids flashing the exam to
  // an unsupported browser before the UA check runs.
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(isChromium());
  }, []);

  if (supported === null) return null;

  if (!supported) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm p-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t("proctoring.requireChromiumTitle")}</h2>
          <p className="text-gray-600">{t("proctoring.requireChromiumBody")}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
