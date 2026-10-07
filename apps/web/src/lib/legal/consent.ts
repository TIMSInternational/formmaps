/**
 * Pure legal-consent logic shared by signup and every checkout.
 *
 * The UI (`@/components/legal/LegalConsent`) only renders checkboxes; which boxes are required,
 * whether the set is valid, and the exact request shape the API records all live here so they are
 * unit-tested once and identical everywhere.
 *
 * API contract (formmaps-platform Node API):
 *   POST /authapi/signup                       body.legalConsent: SignupLegalConsentPayload
 *   POST /api/stripe/create-checkout-session   body.legalConsent: CheckoutLegalConsentPayload
 */
import { LEGAL_DOCUMENT_VERSIONS, type LegalDocumentKey } from "./versions";

export type LegalConsentVariant = "signup" | "checkout-subscription" | "checkout-one-time";

/** Every checkbox the component can show. All start unchecked. */
export interface LegalConsentValues {
  /** signup: "I accept the Terms of Service and Privacy Policy". */
  termsAccepted: boolean;
  /** any variant, when minor / parent purchaser: "I am the parent/guardian, or I have their permission". */
  parentConfirmed: boolean;
  /** checkout-subscription: auto-renewal + trial conversion + Terms/Refund Policy acknowledgement. */
  autoRenewalAck: boolean;
  /** checkout-one-time: Terms + Refund Policy acknowledgement. */
  refundPolicyAck: boolean;
  /** checkout-one-time: consent to immediate delivery of digital content. */
  immediateDeliveryConsent: boolean;
}

export interface LegalConsentOptions {
  /** The student is 13–17 (computed from the date of birth). */
  isMinor?: boolean;
  /** A parent/guardian is the one signing up or paying. */
  isParentPurchaser?: boolean;
}

export interface LegalDocumentAcceptance {
  key: LegalDocumentKey;
  version: string;
}

export interface SignupLegalConsentPayload {
  documents: LegalDocumentAcceptance[];
  parentConfirmed: boolean;
}

export interface CheckoutLegalConsentPayload {
  documents: LegalDocumentAcceptance[];
  parentConfirmed: boolean;
  autoRenewalAck: boolean;
  immediateDeliveryConsent: boolean;
}

export const EMPTY_LEGAL_CONSENT: LegalConsentValues = Object.freeze({
  termsAccepted: false,
  parentConfirmed: false,
  autoRenewalAck: false,
  refundPolicyAck: false,
  immediateDeliveryConsent: false,
});

/** Whole years between a YYYY-MM-DD date of birth and `now`; null when the date is missing/invalid. */
export function ageOn(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Compare calendar dates (UTC) so a time zone cannot move a birthday by a day.
  const ny = now.getUTCFullYear();
  const nm = now.getUTCMonth() + 1;
  const nd = now.getUTCDate();
  let age = ny - y;
  if (nm < mo || (nm === mo && nd < d)) age -= 1;
  return age >= 0 ? age : null;
}

/** Under 18 (the 13+ age gate is enforced separately by the signup schema). Unknown → false. */
export function isMinorByDob(dob: string | null | undefined, now: Date = new Date()): boolean {
  const age = ageOn(dob, now);
  return age !== null && age < 18;
}

export function requiresParentConfirmation(opts: LegalConsentOptions = {}): boolean {
  return Boolean(opts.isMinor || opts.isParentPurchaser);
}

/** The checkboxes shown (and required) for a variant, in display order. */
export function requiredConsentFields(
  variant: LegalConsentVariant,
  opts: LegalConsentOptions = {},
): (keyof LegalConsentValues)[] {
  const base: (keyof LegalConsentValues)[] =
    variant === "signup"
      ? ["termsAccepted"]
      : variant === "checkout-subscription"
        ? ["autoRenewalAck"]
        : ["refundPolicyAck", "immediateDeliveryConsent"];
  return requiresParentConfirmation(opts) ? [...base, "parentConfirmed"] : base;
}

export function isLegalConsentValid(
  variant: LegalConsentVariant,
  values: LegalConsentValues,
  opts: LegalConsentOptions = {},
): boolean {
  return requiredConsentFields(variant, opts).every((f) => values[f] === true);
}

/** Clears every box the variant does not currently show, so a stale tick is never sent. */
export function sanitizeLegalConsentValues(
  variant: LegalConsentVariant,
  values: LegalConsentValues,
  opts: LegalConsentOptions = {},
): LegalConsentValues {
  const shown = new Set(requiredConsentFields(variant, opts));
  const out = { ...EMPTY_LEGAL_CONSENT };
  for (const k of Object.keys(out) as (keyof LegalConsentValues)[]) out[k] = shown.has(k) && values[k] === true;
  return out;
}

const accept = (key: LegalDocumentKey): LegalDocumentAcceptance => ({ key, version: LEGAL_DOCUMENT_VERSIONS[key] });

/**
 * The `legalConsent` request field. Pass `opts` to sanitise against what is shown; without it the
 * values are trusted as-is (LegalConsent already clears hidden boxes through onChange).
 */
export function buildLegalConsentPayload(
  variant: "signup",
  values: LegalConsentValues,
  opts?: LegalConsentOptions,
): SignupLegalConsentPayload;
export function buildLegalConsentPayload(
  variant: "checkout-subscription" | "checkout-one-time",
  values: LegalConsentValues,
  opts?: LegalConsentOptions,
): CheckoutLegalConsentPayload;
export function buildLegalConsentPayload(
  variant: LegalConsentVariant,
  values: LegalConsentValues,
  opts?: LegalConsentOptions,
): SignupLegalConsentPayload | CheckoutLegalConsentPayload;
export function buildLegalConsentPayload(
  variant: LegalConsentVariant,
  values: LegalConsentValues,
  opts?: LegalConsentOptions,
): SignupLegalConsentPayload | CheckoutLegalConsentPayload {
  const vals = opts ? sanitizeLegalConsentValues(variant, values, opts) : values;
  const parentConfirmed = vals.parentConfirmed === true;
  const parental = parentConfirmed ? [accept("parental-consent")] : [];

  if (variant === "signup") {
    return { documents: [accept("terms"), accept("privacy"), ...parental], parentConfirmed };
  }
  return {
    documents: [accept("terms"), accept("refunds"), ...parental],
    parentConfirmed,
    autoRenewalAck: variant === "checkout-subscription" && vals.autoRenewalAck === true,
    immediateDeliveryConsent: variant === "checkout-one-time" && vals.immediateDeliveryConsent === true,
  };
}
