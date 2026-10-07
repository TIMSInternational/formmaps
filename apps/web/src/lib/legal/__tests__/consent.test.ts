import {
  EMPTY_LEGAL_CONSENT,
  ageOn,
  buildLegalConsentPayload,
  isLegalConsentValid,
  isMinorByDob,
  requiredConsentFields,
  requiresParentConfirmation,
  sanitizeLegalConsentValues,
  type LegalConsentValues,
} from "@/lib/legal/consent";
import { LEGAL_DOCUMENT_VERSIONS } from "@/lib/legal/versions";

const v = (patch: Partial<LegalConsentValues>): LegalConsentValues => ({ ...EMPTY_LEGAL_CONSENT, ...patch });

describe("EMPTY_LEGAL_CONSENT", () => {
  it("starts with every box unchecked", () => {
    expect(Object.values(EMPTY_LEGAL_CONSENT).every((x) => x === false)).toBe(true);
  });
});

describe("age helpers", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("computes whole years, not rounding a birthday that has not happened yet", () => {
    expect(ageOn("2009-10-15", now)).toBe(17);
    expect(ageOn("2009-10-16", now)).toBe(16);
    expect(ageOn("2008-10-15", now)).toBe(18);
  });

  it("returns null for empty or invalid dates", () => {
    expect(ageOn("", now)).toBeNull();
    expect(ageOn("not-a-date", now)).toBeNull();
    expect(ageOn(undefined, now)).toBeNull();
  });

  it("treats 13–17 as a minor, 18+ as an adult, and unknown as not-minor", () => {
    expect(isMinorByDob("2013-10-15", now)).toBe(true); // 13
    expect(isMinorByDob("2008-10-16", now)).toBe(true); // 17
    expect(isMinorByDob("2008-10-15", now)).toBe(false); // 18
    expect(isMinorByDob("", now)).toBe(false);
  });

  it("treats under-13 as a minor too (the age gate rejects them separately)", () => {
    expect(isMinorByDob("2016-01-01", now)).toBe(true);
  });
});

describe("requiresParentConfirmation", () => {
  it("is required for a minor or a parent purchaser, not otherwise", () => {
    expect(requiresParentConfirmation({})).toBe(false);
    expect(requiresParentConfirmation({ isMinor: true })).toBe(true);
    expect(requiresParentConfirmation({ isParentPurchaser: true })).toBe(true);
  });
});

describe("requiredConsentFields", () => {
  it("signup: terms only for an adult", () => {
    expect(requiredConsentFields("signup", {})).toEqual(["termsAccepted"]);
  });
  it("signup: terms + parent for a minor", () => {
    expect(requiredConsentFields("signup", { isMinor: true })).toEqual(["termsAccepted", "parentConfirmed"]);
  });
  it("checkout-subscription: auto-renewal ack (+ parent)", () => {
    expect(requiredConsentFields("checkout-subscription", {})).toEqual(["autoRenewalAck"]);
    expect(requiredConsentFields("checkout-subscription", { isParentPurchaser: true })).toEqual([
      "autoRenewalAck",
      "parentConfirmed",
    ]);
  });
  it("checkout-one-time: refund ack + immediate delivery (+ parent)", () => {
    expect(requiredConsentFields("checkout-one-time", {})).toEqual(["refundPolicyAck", "immediateDeliveryConsent"]);
    expect(requiredConsentFields("checkout-one-time", { isMinor: true })).toEqual([
      "refundPolicyAck",
      "immediateDeliveryConsent",
      "parentConfirmed",
    ]);
  });
});

describe("isLegalConsentValid", () => {
  it("signup is invalid until terms are accepted", () => {
    expect(isLegalConsentValid("signup", EMPTY_LEGAL_CONSENT)).toBe(false);
    expect(isLegalConsentValid("signup", v({ termsAccepted: true }))).toBe(true);
  });

  it("signup for a minor also needs the parent box", () => {
    expect(isLegalConsentValid("signup", v({ termsAccepted: true }), { isMinor: true })).toBe(false);
    expect(isLegalConsentValid("signup", v({ termsAccepted: true, parentConfirmed: true }), { isMinor: true })).toBe(
      true,
    );
  });

  it("checkout-subscription needs the auto-renewal acknowledgement, not the terms box", () => {
    expect(isLegalConsentValid("checkout-subscription", v({ termsAccepted: true }))).toBe(false);
    expect(isLegalConsentValid("checkout-subscription", v({ autoRenewalAck: true }))).toBe(true);
    expect(
      isLegalConsentValid("checkout-subscription", v({ autoRenewalAck: true }), { isParentPurchaser: true }),
    ).toBe(false);
  });

  it("checkout-one-time needs BOTH the refund ack and the immediate-delivery consent", () => {
    expect(isLegalConsentValid("checkout-one-time", v({ refundPolicyAck: true }))).toBe(false);
    expect(isLegalConsentValid("checkout-one-time", v({ immediateDeliveryConsent: true }))).toBe(false);
    expect(
      isLegalConsentValid("checkout-one-time", v({ refundPolicyAck: true, immediateDeliveryConsent: true })),
    ).toBe(true);
  });
});

describe("sanitizeLegalConsentValues", () => {
  it("clears boxes the variant does not show, so a stale tick is never sent", () => {
    const dirty = v({ termsAccepted: true, parentConfirmed: true, autoRenewalAck: true, immediateDeliveryConsent: true });
    // Adult signup: the parent box is hidden, checkout boxes do not exist.
    expect(sanitizeLegalConsentValues("signup", dirty, {})).toEqual(v({ termsAccepted: true }));
    expect(sanitizeLegalConsentValues("signup", dirty, { isMinor: true })).toEqual(
      v({ termsAccepted: true, parentConfirmed: true }),
    );
  });
});

describe("buildLegalConsentPayload", () => {
  const V = LEGAL_DOCUMENT_VERSIONS;

  it("signup (adult): terms + privacy, parentConfirmed false", () => {
    expect(buildLegalConsentPayload("signup", v({ termsAccepted: true }))).toEqual({
      documents: [
        { key: "terms", version: V.terms },
        { key: "privacy", version: V.privacy },
      ],
      parentConfirmed: false,
    });
  });

  it("signup (minor): adds parental-consent when the parent box is ticked", () => {
    expect(
      buildLegalConsentPayload("signup", v({ termsAccepted: true, parentConfirmed: true }), { isMinor: true }),
    ).toEqual({
      documents: [
        { key: "terms", version: V.terms },
        { key: "privacy", version: V.privacy },
        { key: "parental-consent", version: V["parental-consent"] },
      ],
      parentConfirmed: true,
    });
  });

  it("signup payload has exactly the API keys (no checkout fields)", () => {
    const p = buildLegalConsentPayload("signup", v({ termsAccepted: true }));
    expect(Object.keys(p).sort()).toEqual(["documents", "parentConfirmed"]);
  });

  it("checkout-subscription: terms + refunds, autoRenewalAck true, immediateDeliveryConsent false", () => {
    expect(buildLegalConsentPayload("checkout-subscription", v({ autoRenewalAck: true }))).toEqual({
      documents: [
        { key: "terms", version: V.terms },
        { key: "refunds", version: V.refunds },
      ],
      parentConfirmed: false,
      autoRenewalAck: true,
      immediateDeliveryConsent: false,
    });
  });

  it("checkout-one-time with a parent purchaser: + parental-consent, immediateDeliveryConsent true", () => {
    expect(
      buildLegalConsentPayload(
        "checkout-one-time",
        v({ refundPolicyAck: true, immediateDeliveryConsent: true, parentConfirmed: true, autoRenewalAck: true }),
        { isParentPurchaser: true },
      ),
    ).toEqual({
      documents: [
        { key: "terms", version: V.terms },
        { key: "refunds", version: V.refunds },
        { key: "parental-consent", version: V["parental-consent"] },
      ],
      parentConfirmed: true,
      // A one-time purchase never renews: a stale tick from another variant is never reported.
      autoRenewalAck: false,
      immediateDeliveryConsent: true,
    });
  });

  it("without opts it trusts the values as given (component already sanitised them)", () => {
    const p = buildLegalConsentPayload("signup", v({ termsAccepted: true, parentConfirmed: true }));
    expect(p.parentConfirmed).toBe(true);
    expect(p.documents.map((d) => d.key)).toContain("parental-consent");
  });
});
