"use client";

/**
 * LegalConsent — the required legal checkboxes for signup and every checkout.
 *
 * Controlled: the parent owns `values` (start from EMPTY_LEGAL_CONSENT — every box unchecked) and
 * gets every change through `onChange`, plus `onValidityChange(valid)` whenever validity flips.
 * Which boxes show, whether they are valid, and the API payload all come from the pure helpers in
 * `@/lib/legal/consent`, so the rules are unit-tested once and identical everywhere.
 *
 * Reusing it in a checkout (paywall, formmaps#246 and follow-ups):
 *
 *   const [consent, setConsent] = useState(EMPTY_LEGAL_CONSENT);
 *   const [consentValid, setConsentValid] = useState(false);
 *   const opts = { isMinor, isParentPurchaser };
 *   <LegalConsent variant="checkout-subscription" price="$29.99" values={consent}
 *     onChange={setConsent} onValidityChange={setConsentValid} {...opts} />
 *   <button disabled={!consentValid}>…</button>
 *   // on submit:
 *   createCheckoutSession({ …, legalConsent: buildLegalConsentPayload("checkout-subscription", consent, opts) })
 *
 * Use variant="checkout-one-time" for the $150 purchase (refund + immediate-delivery boxes).
 * Document links open in a new tab so the form state is never lost.
 */
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  requiredConsentFields,
  isLegalConsentValid,
  sanitizeLegalConsentValues,
  type LegalConsentValues,
  type LegalConsentVariant,
} from "@/lib/legal/consent";
import { LEGAL_DOCUMENT_PATHS } from "@/lib/legal/versions";
import { parseTagged } from "@/lib/legal/inline";

export interface LegalConsentProps {
  variant: LegalConsentVariant;
  values: LegalConsentValues;
  onChange: (values: LegalConsentValues) => void;
  onValidityChange?: (valid: boolean) => void;
  /** 13–17 (from the date of birth): shows the required parent/guardian box. */
  isMinor?: boolean;
  /** A parent/guardian is signing up or paying: shows the required parent/guardian box. */
  isParentPurchaser?: boolean;
  /** checkout-subscription: the monthly price to quote, e.g. "$29.99". Omit when several plans are on screen. */
  price?: string;
  /** Force a language ("en" | "es"); defaults to the app's current i18n language. */
  locale?: "en" | "es";
  className?: string;
}

const TAG_HREF: Record<string, string> = {
  terms: LEGAL_DOCUMENT_PATHS.terms,
  privacy: LEGAL_DOCUMENT_PATHS.privacy,
  refunds: LEGAL_DOCUMENT_PATHS.refunds,
  parental: LEGAL_DOCUMENT_PATHS["parental-consent"],
  cookies: LEGAL_DOCUMENT_PATHS.cookies,
};

const LABEL_KEY: Record<keyof LegalConsentValues, string> = {
  termsAccepted: "consent.signupTerms",
  parentConfirmed: "consent.parent",
  autoRenewalAck: "consent.subscriptionAck",
  refundPolicyAck: "consent.oneTimeRefund",
  immediateDeliveryConsent: "consent.oneTimeDelivery",
};

export function LegalConsent({
  variant,
  values,
  onChange,
  onValidityChange,
  isMinor,
  isParentPurchaser,
  price,
  locale,
  className,
}: LegalConsentProps) {
  const { t: tDefault, i18n } = useTranslation("legal");
  const t = locale && i18n?.getFixedT ? i18n.getFixedT(locale, "legal") : tDefault;
  const baseId = useId();
  const opts = { isMinor, isParentPurchaser };
  const fields = requiredConsentFields(variant, opts);
  const valid = isLegalConsentValid(variant, values, opts);

  // A box that stops being shown (e.g. the DOB changes from 16 to 19) must not stay ticked in the payload.
  const sanitized = sanitizeLegalConsentValues(variant, values, opts);
  const dirty = (Object.keys(values) as (keyof LegalConsentValues)[]).some((k) => values[k] !== sanitized[k]);
  useEffect(() => {
    if (dirty) onChange(sanitized);
  }, [dirty]);

  const lastValid = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastValid.current !== valid) {
      lastValid.current = valid;
      onValidityChange?.(valid);
    }
  }, [valid, onValidityChange]);

  const newTab = t("consent.opensInNewTab");
  const label = (field: keyof LegalConsentValues) => {
    const text = t(LABEL_KEY[field], {
      price: price ?? t("consent.subscriptionPriceAny"),
      interpolation: { escapeValue: false },
    });
    return parseTagged(String(text)).map((tok, i) =>
      tok.kind === "text" || !TAG_HREF[tok.tag] ? (
        <span key={i}>{tok.text}</span>
      ) : (
        <a
          key={i}
          href={TAG_HREF[tok.tag]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2"
          style={{ color: "var(--admin-accent-blue)" }}
        >
          {tok.text}
          <span className="sr-only"> {newTab}</span>
        </a>
      ),
    );
  };

  return (
    <fieldset className={className ?? "flex flex-col gap-3"} data-testid={`legal-consent-${variant}`}>
      <legend className="sr-only">{t("consent.groupLabel")}</legend>
      {fields.map((field) => {
        const id = `${baseId}-${field}`;
        return (
          <div key={field} className="flex items-start gap-2">
            <input
              id={id}
              type="checkbox"
              required
              aria-required="true"
              checked={values[field]}
              onChange={(e) => onChange({ ...values, [field]: e.target.checked })}
              className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
              style={{ accentColor: "#102B47" }}
              data-consent-field={field}
            />
            <label htmlFor={id} className="text-xs leading-5" style={{ color: "#555" }}>
              {label(field)}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}

export default LegalConsent;
