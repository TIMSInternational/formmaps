/**
 * Facts the legal documents quote. Centralised so a change (a new contact address, a price change)
 * is one edit, not a hunt through ten content modules in two languages.
 */
export const LEGAL_ENTITY = {
  name: "NEXA DEV LLC",
  description: "a Florida (USA) multi-member limited liability company",
  descriptionEs: "una sociedad de responsabilidad limitada (LLC) de Florida, Estados Unidos",
  product: "FormMaps",
  methodologyPartner: "TIMS International (TIMS Assessment Group)",
  methodologyPartnerSite: "timshr.com",
} as const;

/**
 * Contact mailboxes. These are the addresses the app already published on /privacy and /terms
 * before the 2026-10-15 documents; keep them in sync with the mailboxes that are actually monitored.
 */
export const LEGAL_CONTACT = {
  privacyEmail: "privacy@formmaps.ai",
  legalEmail: "legal@formmaps.ai",
  billingEmail: "legal@formmaps.ai",
} as const;

/** USD prices quoted by the Terms and the Refund Policy. Must match the checkout lineup. */
export const LEGAL_PRICES = {
  currency: "USD",
  starterMonthly: "$9.99",
  proMonthly: "$29.99",
  premiumMonthly: "$49.99",
  oneTime: "$150",
  trialDays: 7,
  refundWindowDays: 14,
} as const;
