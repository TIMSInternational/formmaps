"use client";

import { Button } from "@/components/ui/button";
import { useConsent } from "@/hooks/useConsent";
import { Cookie, Settings, Shield } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

/**
 * GDPR-compliant cookie consent banner
 * Shows at bottom of screen until user makes a choice
 */
export function CookieConsentBanner() {
  const { showBanner, acceptAll, acceptNecessaryOnly, consent } = useConsent();
  const [showDetails, setShowDetails] = useState(false);

  if (!showBanner || consent) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 bg-white border-t border-gray-200 shadow-2xl animate-in slide-in-from-bottom duration-300"
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-description"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 p-3 bg-indigo-50 rounded-xl">
            <Cookie className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          </div>

          {/* Content */}
          <div className="flex-1">
            <h2 id="cookie-banner-title" className="text-lg font-semibold text-gray-900 mb-1">
              We value your privacy
            </h2>
            <p id="cookie-banner-description" className="text-sm text-gray-600">
              We use cookies and similar technologies to improve your experience, analyze traffic, 
              and personalize content. By clicking "Accept All", you consent to our use of cookies.{" "}
              <Link href="/legal/privacy" className="text-indigo-600 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Customize
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={acceptNecessaryOnly}
            >
              Necessary Only
            </Button>
            <Button
              size="sm"
              onClick={acceptAll}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Accept All
            </Button>
          </div>
        </div>

        {/* Details Panel */}
        {showDetails && (
          <div className="mt-4 pt-4 border-t border-gray-100 animate-in fade-in duration-200">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-green-600" aria-hidden="true" />
                  <span className="font-medium text-gray-900">Necessary</span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Always On</span>
                </div>
                <p className="text-xs text-gray-500">
                  Required for the website to function. Cannot be disabled.
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Cookie className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                  <span className="font-medium text-gray-900">Analytics</span>
                </div>
                <p className="text-xs text-gray-500">
                  Help us understand how you use our platform to improve user experience.
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg opacity-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">Marketing</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Not Used</span>
                </div>
                <p className="text-xs text-gray-500">
                  We don&apos;t currently use marketing cookies or third-party ads.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
