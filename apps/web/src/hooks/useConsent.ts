"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Consent types for GDPR compliance
 */
export interface ConsentPreferences {
  necessary: boolean; // Always true, required for app to work
  analytics: boolean; // Telemetry tracking
  marketing: boolean; // Third-party marketing/ads (not used currently)
}

const CONSENT_KEY = "telemetry_consent";
const CONSENT_VERSION = "1.0"; // Bump when privacy policy changes

/**
 * Get stored consent from localStorage
 */
export function getStoredConsent(): ConsentPreferences | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    // Check version - if outdated, require re-consent
    if (parsed.version !== CONSENT_VERSION) return null;
    
    return parsed.preferences;
  } catch {
    return null;
  }
}

/**
 * Save consent preferences to localStorage
 */
export function saveConsent(preferences: ConsentPreferences): void {
  if (typeof window === "undefined") return;
  
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      preferences,
    })
  );
}

/**
 * Check if analytics is consented
 */
export function hasAnalyticsConsent(): boolean {
  const consent = getStoredConsent();
  return consent?.analytics ?? false;
}

/**
 * Hook for managing consent state
 */
export function useConsent() {
  const [consent, setConsentState] = useState<ConsentPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  // Load consent on mount
  useEffect(() => {
    const stored = getStoredConsent();
    if (stored) {
      setConsentState(stored);
      setShowBanner(false);
    } else {
      // No consent recorded, show banner
      setShowBanner(true);
    }
    setIsLoading(false);
  }, []);

  const setConsent = useCallback((preferences: ConsentPreferences) => {
    saveConsent(preferences);
    setConsentState(preferences);
    setShowBanner(false);
    
    // Reload telemetry service with new consent
    if (typeof window !== "undefined" && preferences.analytics) {
      // Telemetry can now collect data
      window.dispatchEvent(new CustomEvent("consentGranted", { detail: preferences }));
    }
  }, []);

  const acceptAll = useCallback(() => {
    setConsent({
      necessary: true,
      analytics: true,
      marketing: true,
    });
  }, [setConsent]);

  const acceptNecessaryOnly = useCallback(() => {
    setConsent({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  }, [setConsent]);

  const revokeConsent = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(CONSENT_KEY);
    }
    setConsentState(null);
    setShowBanner(true);
  }, []);

  return {
    consent,
    isLoading,
    showBanner,
    setConsent,
    acceptAll,
    acceptNecessaryOnly,
    revokeConsent,
    hasAnalytics: consent?.analytics ?? false,
  };
}
