import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E, LEGAL_PRICES as P } from "../../company";

const legal = `[${C.legalEmail}](mailto:${C.legalEmail})`;

export const termsEn: LegalDocumentContent = {
  key: "terms",
  locale: "en",
  title: "Terms of Service",
  summary:
    "These Terms are the agreement between you and FormMaps. In short: you must be 13 or older (and have your parent's or guardian's permission if you are under 18), take assessments honestly, and use your results as guidance, not as a guarantee. Paid plans renew every month until you cancel, and you can cancel at any time.",
  sections: [
    {
      id: "who-we-are",
      title: "1. Who we are",
      blocks: [
        {
          type: "p",
          text: `${E.product} is operated by **${E.name}**, ${E.description} ("FormMaps", "we", "us"). FormMaps helps students explore careers and plan their education using assessments, results, reports and AI-assisted suggestions.`,
        },
        {
          type: "p",
          text: `Our assessment methodology and content partner is **${E.methodologyPartner}** (${E.methodologyPartnerSite}), which scores some of the assessments you take on FormMaps.`,
        },
        {
          type: "p",
          text: "By creating an account, buying a plan, or using FormMaps, you agree to these Terms, to our [Privacy Policy](/privacy) and, if you pay, to our [Refund & Cancellation Policy](/refunds). If you do not agree, please do not use FormMaps.",
        },
      ],
    },
    {
      id: "eligibility",
      title: "2. Who can use FormMaps",
      blocks: [
        {
          type: "ul",
          items: [
            "**13 and older:** you may create your own account.",
            "**13 to 17:** you need permission from your parent or legal guardian. Often your parent or guardian will create the account or pay for it with you. When you sign up, you (or your parent or guardian) must confirm this permission. See our [Parental Consent statement](/parental-consent).",
            "**Under 13:** you can only use FormMaps through a school or institution that has obtained the consent required by law from your parent or guardian. Self-service signup is not available under 13.",
          ],
        },
        {
          type: "p",
          text: "If you sign up or pay on behalf of a child, you confirm that you are that child's parent or legal guardian and you accept these Terms on their behalf and on your own.",
        },
      ],
    },
    {
      id: "accounts",
      title: "3. Your account",
      blocks: [
        {
          type: "ul",
          items: [
            "Give accurate information, including your real date of birth, and keep it up to date.",
            "Keep your password secret. You are responsible for what happens in your account. Tell us right away at " +
              legal +
              " if you think someone else has used it.",
            "One person per account. Do not share, sell or transfer your account.",
            "If your account was created by a school, the school may also manage parts of it (for example, linking you to classes or counselors).",
          ],
        },
      ],
    },
    {
      id: "acceptable-use",
      title: "4. Acceptable use",
      blocks: [
        { type: "p", text: "When you use FormMaps you must not:" },
        {
          type: "ul",
          items: [
            "break the law or help anyone else break it;",
            "harass, bully, threaten or harm anyone, or upload hateful, sexual or violent content;",
            "upload content you do not have the right to share, or other people's personal data without permission;",
            "try to access accounts, data or systems that are not yours, test our security without written permission, or interfere with how FormMaps works (including with bots, scrapers or excessive requests);",
            "copy, resell, reverse-engineer or build a competing product from FormMaps, its assessments or its reports.",
          ],
        },
      ],
    },
    {
      id: "assessment-integrity",
      title: "5. Taking assessments honestly",
      blocks: [
        {
          type: "p",
          text: "Your results are only useful if they really reflect you. So you must take assessments yourself, without someone else answering for you, without impersonating another person, and without copying, recording, sharing or publishing the questions or answer keys.",
        },
        {
          type: "p",
          text: "Some assessments use integrity checks (for example, detecting when you leave the assessment window). We may invalidate results, ask you to retake an assessment, or suspend an account if we reasonably believe an assessment was not taken honestly.",
        },
      ],
    },
    {
      id: "ip",
      title: "6. Our content and your licence",
      blocks: [
        {
          type: "p",
          text: `FormMaps, its software, design, assessments, questions, scoring methods, reports and other content belong to ${E.name}, ${E.methodologyPartner} or our licensors, and are protected by intellectual-property laws.`,
        },
        {
          type: "p",
          text: "We give you a personal, limited, non-exclusive, non-transferable and revocable licence to use FormMaps for your own education and career planning while your account is active. You may download and keep your own reports for personal use and share them with people who help you (such as your family, school or counselor). You may not use them commercially.",
        },
      ],
    },
    {
      id: "user-content",
      title: "7. Your content",
      blocks: [
        {
          type: "p",
          text: "You own what you upload or write in FormMaps (for example, resumes, essays, goals and messages). You give us permission to store, process and display that content only as needed to run FormMaps for you, as described in our [Privacy Policy](/privacy). You are responsible for making sure you have the right to upload it.",
        },
      ],
    },
    {
      id: "payment",
      title: "8. Payment terms",
      blocks: [
        {
          type: "p",
          text: `**Prices and currency.** Prices are shown and charged in US dollars (${P.currency}). Current plans: Starter ${P.starterMonthly}/month, Pro ${P.proMonthly}/month, Premium ${P.premiumMonthly}/month, and a One-time purchase of ${P.oneTime}. The price that applies is the one shown at checkout.`,
        },
        {
          type: "p",
          text: `**Who charges you.** Payments are processed by Stripe. The merchant is **${E.name}**, and that is the name you will see on your card statement. We never see or store your full card number.`,
        },
        {
          type: "p",
          text: "**Automatic renewal.** Monthly plans (Starter, Pro and Premium) are subscriptions. **They renew automatically every month and your payment method is charged the then-current monthly price until you cancel.** We will tell you in advance before a price change applies to your subscription, and you can cancel before it does.",
        },
        {
          type: "p",
          text: `**Free trial.** Monthly plans may start with a ${P.trialDays}-day free trial. A valid card is required to start the trial. **Unless you cancel before the trial ends, it converts automatically into a paid monthly subscription and your card is charged the then-current monthly price, and every month after that until you cancel.** During the trial (and whenever a plan is unpaid) you can take assessments, but you see only a preview of your results; full results unlock once payment is made.`,
        },
        {
          type: "p",
          text: "**How to cancel.** You can cancel at any time in your account: **Dashboard → Subscriptions → Manage billing** (this opens Stripe's secure billing portal), or by emailing " +
            legal +
            ". Cancelling stops all future charges. You keep access until the end of the period you already paid for; we do not refund partial months except as described in the [Refund & Cancellation Policy](/refunds).",
        },
        {
          type: "p",
          text: `**One-time purchase (${P.oneTime}).** A one-time payment lets you take the included assessments, see your full results and download your reports. It does not renew and does not include subscription features such as coaching. Your results stay available in your account after purchase.`,
        },
        {
          type: "p",
          text: "**Taxes and fees.** Prices do not include taxes. Taxes that apply in your country — for example, Costa Rica's VAT (IVA) on cross-border digital services, or other local sales or digital-services taxes — may be added at checkout or charged by your card issuer. Your bank or card issuer may also charge currency-conversion or foreign-transaction fees; those are set by them, not by us.",
        },
        {
          type: "p",
          text: "**Failed payments.** If a renewal payment fails, we may retry it and may pause paid features until the payment succeeds.",
        },
      ],
    },
    {
      id: "refunds",
      title: "9. Refunds",
      blocks: [
        {
          type: "p",
          text: "Refunds, trial cancellations and payment disputes are covered by our [Refund & Cancellation Policy](/refunds), which is part of these Terms.",
        },
      ],
    },
    {
      id: "guidance-only",
      title: "10. Guidance only — please read",
      blocks: [
        {
          type: "p",
          text: "FormMaps gives **guidance**. Assessments, results, reports, career matches and AI-generated suggestions are informative tools to help you think about your options. They:",
        },
        {
          type: "ul",
          items: [
            "do **not** guarantee admission to any school or university, any job, any academic result or any career outcome;",
            "are **not** a clinical, medical or psychological diagnosis or evaluation;",
            "are **not** a substitute for advice from qualified professionals such as psychologists, doctors, school counselors or admissions advisers.",
          ],
        },
        {
          type: "p",
          text: "AI-generated content can be incomplete or wrong. Always check important information (such as admission requirements, deadlines and costs) with the official source, and make important decisions together with your family and the professionals who know you.",
        },
      ],
    },
    {
      id: "warranty",
      title: "11. Warranty disclaimer",
      blocks: [
        {
          type: "p",
          text: "We work hard to keep FormMaps accurate, available and secure, but to the extent the law allows, FormMaps is provided \"as is\" and \"as available\", without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy and uninterrupted availability.",
        },
      ],
    },
    {
      id: "liability",
      title: "12. Limitation of liability",
      blocks: [
        {
          type: "p",
          text: `To the extent the law allows, ${E.name} and its partners are not liable for indirect, incidental, special or consequential damages, or for decisions you make based on guidance from FormMaps. Our total liability for any claim related to FormMaps is limited to the amount you paid us in the 12 months before the claim.`,
        },
      ],
    },
    {
      id: "consumer-rights",
      title: "13. Your rights as a consumer",
      blocks: [
        {
          type: "p",
          text: "**Nothing in these Terms limits or excludes rights that you have under consumer-protection law and that cannot be waived by contract**, including, where they apply, rights under Costa Rica's Law 7472 (Ley de Promoción de la Competencia y Defensa Efectiva del Consumidor) and Colombia's Law 1480 of 2011 (Estatuto del Consumidor). If any part of these Terms conflicts with those rights, those rights prevail.",
        },
      ],
    },
    {
      id: "termination",
      title: "14. Suspension and termination",
      blocks: [
        {
          type: "ul",
          items: [
            "You can stop using FormMaps and ask us to delete your account at any time (see the [Privacy Policy](/privacy)).",
            "We may suspend or close an account that breaks these Terms, that puts other people or FormMaps at risk, or when the law requires it. When reasonable, we will tell you why and give you a chance to fix the problem.",
            "If you open a chargeback or payment dispute, paid access is suspended while the dispute is open, as described in the [Refund & Cancellation Policy](/refunds).",
          ],
        },
      ],
    },
    {
      id: "changes",
      title: "15. Changes to these Terms",
      blocks: [
        {
          type: "p",
          text: "We may update these Terms. Each version has a date at the top of this page. If we make a material change, we will notify you in advance (for example, by email or in the app) and, where required, ask you to accept the new version before you continue using paid features. If you do not agree, you can cancel before the change takes effect.",
        },
      ],
    },
    {
      id: "governing-law",
      title: "16. Governing law and disputes",
      blocks: [
        {
          type: "p",
          text: "These Terms are governed by the laws of the State of Florida, United States, without regard to its conflict-of-law rules. This does not take away the protection of the mandatory consumer-protection laws of the country where you live, and you may bring a claim before the courts or consumer authorities that those laws allow. Before starting a formal dispute, please contact us — most problems can be solved quickly.",
        },
      ],
    },
    {
      id: "contact",
      title: "17. Contact",
      blocks: [
        {
          type: "p",
          text: `${E.name} — ${E.product}. Questions about these Terms: ${legal}. Privacy questions: [${C.privacyEmail}](mailto:${C.privacyEmail}).`,
        },
      ],
    },
  ],
};
