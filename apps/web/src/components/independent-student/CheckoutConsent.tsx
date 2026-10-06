"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Import seam for checkout consent (#243).
 *
 * TODO(legal): replace the body with the legal workstream's
 * `@/components/legal/LegalConsent` (props: variant "signup" |
 * "checkout-subscription" | "checkout-one-time", onValidityChange(valid),
 * values) once it is on main — callers already pass the same props, so the
 * swap is one import. Until then this is a minimal REQUIRED checkbox: checkout
 * stays disabled until it is ticked. Placeholder copy, not legal-reviewed.
 */
export type CheckoutConsentVariant = "checkout-subscription" | "checkout-one-time";

export function CheckoutConsent({
  variant,
  onValidityChange,
}: {
  variant: CheckoutConsentVariant;
  onValidityChange: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  useEffect(() => { onValidityChange(checked); }, [checked, onValidityChange]);
  const id = `checkout-consent-${variant}`;
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-xs text-gray-600 text-left">
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="mt-0.5"
        data-testid={id}
      />
      <span>{t(variant === "checkout-one-time" ? "independentStudent.consent.oneTime" : "independentStudent.consent.subscription")}</span>
    </label>
  );
}
