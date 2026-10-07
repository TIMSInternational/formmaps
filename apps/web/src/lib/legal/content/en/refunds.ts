import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E, LEGAL_PRICES as P } from "../../company";

const billing = `[${C.billingEmail}](mailto:${C.billingEmail})`;

export const refundsEn: LegalDocumentContent = {
  key: "refunds",
  locale: "en",
  title: "Refund & Cancellation Policy",
  summary: `Cancel a free trial within ${P.trialDays} days and you are never charged. Cancel a monthly plan any time and keep access until the end of the month you paid for. Your first monthly charge, and the ${P.oneTime} one-time purchase, can be refunded within ${P.refundWindowDays} days if you have not yet received your full results or reports.`,
  sections: [
    {
      id: "trial",
      title: `1. Free trial (${P.trialDays} days)`,
      blocks: [
        {
          type: "p",
          text: `If you cancel at any time during the ${P.trialDays}-day free trial, **you are never charged**. If you do not cancel, the trial converts into a paid monthly subscription at the end of the trial.`,
        },
      ],
    },
    {
      id: "monthly",
      title: "2. Monthly plans (Starter, Pro, Premium)",
      blocks: [
        {
          type: "ul",
          items: [
            "You can cancel at any time. Cancelling stops all future charges.",
            "After you cancel, **your access continues until the end of the period you already paid for**.",
            "We do not give refunds for partial months.",
            `**First-charge guarantee:** we will refund your **first** paid monthly charge in full if you ask within ${P.refundWindowDays} days of that charge **and** no full report has been downloaded from your account.`,
          ],
        },
      ],
    },
    {
      id: "one-time",
      title: `3. One-time purchase (${P.oneTime})`,
      blocks: [
        {
          type: "ul",
          items: [
            `**Full refund within ${P.refundWindowDays} days** of purchase if no full results have been unlocked or viewed and no report has been downloaded.`,
            "**Once your full results have been delivered, the purchase is non-refundable.** These are digital contents delivered immediately with your express consent at checkout, where you acknowledged that the refund window ends once full results are delivered.",
            "**Exceptions:** we always refund duplicate charges, and charges where a technical failure on our side prevented the results or reports from being delivered and we could not fix it within a reasonable time.",
          ],
        },
      ],
    },
    {
      id: "disputes",
      title: "4. Chargebacks and payment disputes",
      blocks: [
        {
          type: "p",
          text: `Please contact us first at ${billing} — we usually resolve problems faster than a bank dispute. If you open a chargeback or dispute, **paid access is suspended while the dispute is open**. Access is restored if the dispute is resolved in favour of the charge; it ends if the charge is reversed.`,
        },
      ],
    },
    {
      id: "how-refunds-are-paid",
      title: "5. How refunds are paid",
      blocks: [
        {
          type: "p",
          text: "Approved refunds go back to the original payment method through Stripe. They usually appear within 5–10 business days, depending on your bank or card issuer. Refunds are made in US dollars; the amount you see in your local currency may differ because of exchange rates or fees set by your bank. When a refund is issued, the paid access it covered ends.",
        },
      ],
    },
    {
      id: "request",
      title: "6. How to request a refund",
      blocks: [
        {
          type: "p",
          text: `Email ${billing} from the email address on the account and include: the account email, the student's name, the date and amount of the charge, the plan (monthly or one-time), and the reason. We reply within 5 business days.`,
        },
      ],
    },
    {
      id: "cancel",
      title: "7. How to cancel",
      blocks: [
        {
          type: "p",
          text: `In your account go to **Dashboard → Subscriptions → Manage billing** and cancel in Stripe's secure billing portal, or email ${billing}. The one-time purchase does not renew, so there is nothing to cancel.`,
        },
      ],
    },
    {
      id: "statutory-rights",
      title: "8. Your legal rights",
      blocks: [
        {
          type: "p",
          text: "This policy does not limit any right you have under consumer-protection law that cannot be waived, such as, where applicable, the right of withdrawal (\"retracto\") and payment reversal (\"reversión del pago\") under Colombia's Law 1480 of 2011, or your rights under Costa Rica's Law 7472. Where those laws give you more, they apply.",
        },
      ],
    },
    {
      id: "contact",
      title: "9. Contact",
      blocks: [{ type: "p", text: `${E.name} — ${E.product}. Billing and refunds: ${billing}.` }],
    },
  ],
};
