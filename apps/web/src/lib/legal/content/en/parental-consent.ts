import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E } from "../../company";

const privacy = `[${C.privacyEmail}](mailto:${C.privacyEmail})`;

export const parentalConsentEn: LegalDocumentContent = {
  key: "parental-consent",
  locale: "en",
  title: "Parental Consent",
  summary:
    "Students aged 13 to 17 need the permission of a parent or legal guardian to use FormMaps. This page explains exactly what you authorize when you give that permission, and how you can withdraw it.",
  sections: [
    {
      id: "who",
      title: "1. Who gives this consent",
      blocks: [
        {
          type: "p",
          text: `This consent is given to **${E.name}**, which operates ${E.product}, by the parent or legal guardian of a student aged 13 to 17 — either directly (when the parent or guardian signs up or pays) or through the student, who confirms at signup that they have their parent's or guardian's permission. Students under 13 can only join through a school, which obtains consent separately.`,
        },
      ],
    },
    {
      id: "what-you-authorize",
      title: "2. What you authorize",
      blocks: [
        { type: "p", text: "By giving consent, you authorize FormMaps to:" },
        {
          type: "ul",
          items: [
            "create and run a FormMaps account for your child;",
            "collect and process your child's personal data as described in the [Privacy Policy](/privacy), **including sensitive data: the responses and results of psychometric assessments** (PCA/DISC, LIA cognitive, Personality and Vocational 360, including evaluations by parents or teachers you or your child invite);",
            "use AI (Anthropic Claude models through AWS Bedrock) to generate guidance and reports from that data, which is not used to train third-party models;",
            `share assessment data with our methodology partner **${E.methodologyPartner}** so it can score the assessments;`,
            "share your child's data with their school, counselors and teachers if your child's account is linked to a school;",
            "**transfer the data to the United States**, where FormMaps and its providers process it, with contractual safeguards.",
          ],
        },
      ],
    },
    {
      id: "payment",
      title: "3. Who pays",
      blocks: [
        {
          type: "p",
          text: "If you pay for a plan for your child, you are the customer for that payment and accept the [Terms of Service](/terms) (including the Payment terms) and the [Refund & Cancellation Policy](/refunds). Monthly plans renew automatically until cancelled.",
        },
      ],
    },
    {
      id: "rights",
      title: "4. Your rights as a parent or guardian",
      blocks: [
        {
          type: "p",
          text: "You can, at any time and free of charge: see the data we hold about your child, correct it, ask us to delete it, receive a copy, and refuse further collection or use. You can also complain to the data-protection authority (PRODHAB in Costa Rica, the SIC in Colombia). See the [Privacy Policy](/privacy) for details.",
        },
      ],
    },
    {
      id: "withdraw",
      title: "5. Withdrawing consent",
      blocks: [
        {
          type: "p",
          text: `You can withdraw this consent at any time by emailing ${privacy}. When you do, we stop processing your child's data for FormMaps' services, close the account and delete the data, except what we must keep by law (such as payment records). Withdrawing consent does not affect processing already done. If there is an active subscription, cancel it (or ask us to) so it is not charged again; refunds follow the [Refund & Cancellation Policy](/refunds).`,
        },
      ],
    },
    {
      id: "verification",
      title: "6. Verification",
      blocks: [
        {
          type: "p",
          text: "We may take reasonable steps to confirm that the person giving consent is the student's parent or legal guardian — for example, asking for confirmation by email or, when a payment is made, relying on the payment by the parent or guardian. If we cannot confirm consent when it is required, we may limit or close the account.",
        },
      ],
    },
    {
      id: "contact",
      title: "7. Contact",
      blocks: [{ type: "p", text: `${E.name} — ${E.product}. Questions about consent or your child's data: ${privacy}.` }],
    },
  ],
};
