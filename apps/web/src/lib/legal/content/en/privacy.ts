import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E } from "../../company";

const privacy = `[${C.privacyEmail}](mailto:${C.privacyEmail})`;

export const privacyEn: LegalDocumentContent = {
  key: "privacy",
  locale: "en",
  title: "Privacy Policy",
  summary:
    "This policy explains what personal data FormMaps collects, why, who helps us process it, and the rights you and your parent or guardian have. Assessment results are sensitive, especially for students under 18, so we only process them with the required authorization, we never sell personal data, and we never use it for targeted advertising.",
  sections: [
    {
      id: "controller",
      title: "1. Who is responsible for your data",
      blocks: [
        {
          type: "p",
          text: `The data controller (in Colombia, the "responsable del tratamiento") is **${E.name}**, ${E.description}, which operates ${E.product}. Contact for any privacy matter: ${privacy}.`,
        },
        {
          type: "p",
          text: "If you use FormMaps through a school, the school also decides how some of your data is used (for example, which counselors and teachers can see your progress). In that case the school is responsible for its own use of the data, and we process it on its instructions.",
        },
      ],
    },
    {
      id: "data-we-collect",
      title: "2. What data we collect",
      blocks: [
        {
          type: "ul",
          items: [
            "**Account and identity data:** name, email address, password (stored only as a secure hash), role (student, parent, counselor, etc.), language and preferences.",
            "**Date of birth:** to apply our age rules and to know when parent or guardian permission is needed.",
            "**Parent or guardian data:** name and contact details of the parent or guardian who gives permission, pays, or takes part in evaluations.",
            "**School data:** school name, grade, classes and the counselors or teachers linked to your account, when you join through a school.",
            "**Assessment responses and results:** your answers and results in our assessments — the PCA (behavioral profile, DISC model), LIA (cognitive aptitudes), Personality, and Vocational 360 (which includes evaluations about you completed by parents or teachers you invite).",
            "**Academic and planning data:** grades, courses, goals, interests, college and career lists, and plans you create.",
            "**Resumes and applications:** resumes, cover letters, essays and application information you write or upload.",
            "**Messages and sessions:** messages with counselors or coaches and, where offered, video session records (time and participants, not recordings unless you are told otherwise).",
            "**Payment data:** Stripe processes your card. We receive only limited information (such as the plan, amount, status, the last four digits and the card brand). **We do not store full card numbers.**",
            "**Technical and log data:** IP address, device and browser type, pages visited, error reports and security logs.",
            "**Cookies and similar technologies:** see our [Cookie Notice](/cookies).",
          ],
        },
      ],
    },
    {
      id: "sensitive-data",
      title: "3. Sensitive data",
      blocks: [
        {
          type: "p",
          text: "We treat **psychometric assessment responses and results as sensitive data**, and we give extra protection to all data of students under 18. For students under 18, we process assessment data only with the authorization of their parent or legal guardian (see [Parental Consent](/parental-consent)). You are never required to answer an assessment question you do not want to answer, but some results cannot be produced without complete answers.",
        },
      ],
    },
    {
      id: "purposes",
      title: "4. Why we use your data (purposes and legal bases)",
      blocks: [
        {
          type: "table",
          head: ["Purpose", "Legal basis"],
          rows: [
            ["Create and run your account; provide assessments, results, reports and planning tools", "Performance of our contract with you; for sensitive and minors' data, the express authorization of the student or their parent/guardian"],
            ["Score assessments with our methodology partner", "Contract and express authorization"],
            ["Generate AI-assisted suggestions and reports", "Contract and express authorization"],
            ["Process payments, prevent fraud, keep accounting and tax records", "Contract and legal obligation"],
            ["Send service emails (account, security, billing, results ready)", "Contract and legitimate interest"],
            ["Send tips and product news", "Your consent (opt-in); you can withdraw it at any time"],
            ["Improve FormMaps with usage analytics", "Your consent (opt-in through the cookie banner)"],
            ["Keep FormMaps secure, fix errors, comply with the law and respond to authorities", "Legitimate interest and legal obligation"],
          ],
        },
      ],
    },
    {
      id: "minors",
      title: "5. Children and teenagers",
      blocks: [
        {
          type: "ul",
          items: [
            "**13 to 17:** students may sign up themselves only with the permission of their parent or legal guardian, which they (or the parent/guardian) confirm at signup. In many cases the parent or guardian creates the account or pays for it.",
            "**Colombia:** for minors' data and sensitive data we obtain the prior, express and informed authorization of the parent or legal representative, as required by Law 1581 of 2012 and Decree 1377 of 2013 (now in Decree 1074 of 2015), and we respect the best interests of the child and their fundamental rights.",
            "**Costa Rica:** we process minors' data with the consent of their legal representative, as required by Law 8968.",
            "**United States (COPPA):** we do not knowingly collect personal information from children under 13 except through school-authorized programs where the school provides consent on behalf of the parent for educational purposes. Self-service signup is blocked under 13.",
            "**If we learn** that we collected data from a child under 13 without the required consent, or from a 13–17 student without parent/guardian permission, we will suspend the account and delete the data (or obtain the required consent) without undue delay. If you believe this has happened, write to " +
              privacy +
              ".",
          ],
        },
      ],
    },
    {
      id: "ai",
      title: "6. How we use AI",
      blocks: [
        {
          type: "p",
          text: "Some features (for example, career suggestions, report narratives and resume help) use artificial intelligence. We use **Anthropic Claude models through Amazon Web Services (AWS Bedrock)**. The data sent is limited to what the feature needs. Under our provider terms, **your data is not used to train third-party AI models**.",
        },
        {
          type: "p",
          text: "AI suggestions are guidance only. We do **not** make decisions based solely on automated processing that have legal or similarly significant effects on you; your results and suggestions are information for you, your family and your school to consider.",
        },
      ],
    },
    {
      id: "sharing",
      title: "7. Who we share data with",
      blocks: [
        {
          type: "p",
          text: "We share personal data only with service providers that process it on our behalf under contracts that require confidentiality and security (processors / \"encargados\"), with your school when you use FormMaps through one, and with authorities when the law requires it. Our main providers are:",
        },
        {
          type: "table",
          head: ["Provider", "What they do", "Where data is processed"],
          rows: [
            ["Amazon Web Services (AWS)", "Hosting, database and file storage, email delivery (Amazon SES), AI processing (Amazon Bedrock)", "United States"],
            ["Vercel", "Web hosting and content delivery for the FormMaps website", "United States"],
            ["Stripe", "Payment processing and billing portal", "United States"],
            [`${E.methodologyPartner}`, "Scoring of assessments (PCA and related instruments) under our methodology partnership", `Contact us at ${C.privacyEmail} for current processing locations`],
            ["Sentry", "Error monitoring (personal data is removed before reports are sent)", "United States"],
            ["Daily.co", "Video sessions with counselors or coaches, where offered", "United States"],
          ],
        },
        {
          type: "p",
          text: "Usage analytics are first-party: if you opt in, usage events are sent only to FormMaps' own servers (hosted on AWS); no third-party analytics or advertising provider receives them.",
        },
      ],
    },
    {
      id: "no-sale",
      title: "8. We do not sell your data",
      blocks: [
        {
          type: "p",
          text: "We **do not sell** personal data, we **do not share** it for cross-context behavioral or targeted advertising, and we never sell or rent minors' data.",
        },
      ],
    },
    {
      id: "transfers",
      title: "9. International transfers",
      blocks: [
        {
          type: "p",
          text: "FormMaps is operated from the United States and our main providers process data there. If you live in Costa Rica, Colombia or another country, your data is transferred to the United States. We do this on the basis of your express consent or authorization (or that of your parent or guardian) — as provided in Article 14 of Costa Rica's Law 8968 and Article 26 of Colombia's Law 1581 — and with contractual safeguards with our providers that require them to protect your data.",
        },
      ],
    },
    {
      id: "retention",
      title: "10. How long we keep data",
      blocks: [
        {
          type: "ul",
          items: [
            "**Account data, assessments and reports:** while your account is active. If an account has been inactive for 3 years, we may delete it after notifying you.",
            "**When you delete your account:** we delete or anonymize your personal data within 30 days, except what we must keep by law.",
            "**Payment and tax records:** kept for the period required by tax and accounting law (generally up to 7 years).",
            "**Backups:** deleted data disappears from our backups as they roll off, normally within 35 days.",
            "**Security logs:** kept for a limited period, normally no more than 12 months.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "11. Your rights",
      blocks: [
        {
          type: "p",
          text: "Depending on where you live, you (or your parent or guardian, if you are under 18) have the right to:",
        },
        {
          type: "ul",
          items: [
            "**Access** your data and know how it is used;",
            "**Rectify** (correct) inaccurate or incomplete data;",
            "**Delete** your data (cancellation / \"supresión\"), unless the law requires us to keep it;",
            "**Portability:** receive a copy of your data in a common format;",
            "**Object** to certain uses and **revoke** your consent or authorization at any time (this does not affect processing already done);",
            "**Complain** to the data-protection authority.",
          ],
        },
        {
          type: "p",
          text: "**Costa Rica (Law 8968 and its regulations):** you have the rights of access, rectification and deletion, and you may file a complaint with the **Agencia de Protección de Datos de los Habitantes (PRODHAB)**.",
        },
        {
          type: "p",
          text: "**Colombia (Law 1581 of 2012 and Decree 1377 of 2013):** you may know, update, rectify and delete your data, request proof of your authorization, be informed about how your data is used, revoke the authorization, and file a complaint with the **Superintendencia de Industria y Comercio (SIC)** after first contacting us.",
        },
        {
          type: "p",
          text: "**United States:** parents of children whose data we hold under COPPA can review their child's data, ask us to delete it, and refuse further collection or use. Residents of California and other states with privacy laws can ask to know, access, correct and delete their personal data, and will not be discriminated against for exercising these rights. We do not sell or share personal data for targeted advertising, so there is nothing to opt out of.",
        },
      ],
    },
    {
      id: "exercise-rights",
      title: "12. How to exercise your rights",
      blocks: [
        {
          type: "p",
          text: `Email ${privacy} from the email address on your account (or tell us how we can verify who you are). Say what you are asking for. A parent or guardian acting for a student should say so; we may ask for reasonable proof.`,
        },
        {
          type: "p",
          text: "We answer within the deadlines required by applicable law and aim to resolve every request within 15 business days. In Colombia, queries (\"consultas\") are answered within 10 business days and claims (\"reclamos\") within 15 business days, as set out in Articles 14 and 15 of Law 1581; if we need more time we will tell you why, within the extensions the law allows. Exercising your rights is free.",
        },
      ],
    },
    {
      id: "delete-account",
      title: "13. How to delete your account",
      blocks: [
        {
          type: "p",
          text: `Email ${privacy} from your account's email address with the subject "Delete my account". If you have a monthly plan, cancel it first in **Dashboard → Subscriptions → Manage billing** so you are not charged again. We confirm the deletion by email. If your account belongs to a school program, we coordinate the deletion with your school.`,
        },
      ],
    },
    {
      id: "security",
      title: "14. Security",
      blocks: [
        {
          type: "p",
          text: "We use technical and organizational measures to protect your data, including encryption in transit (HTTPS) and at rest, secure session cookies, hashed passwords, access limited to people who need it, removal of personal data from error reports, monitoring and regular reviews. No system is 100% secure, so please also protect your password.",
        },
      ],
    },
    {
      id: "breach",
      title: "15. If there is a security incident",
      blocks: [
        {
          type: "p",
          text: "If a security incident affects your personal data, we will act to contain it and will notify you and the competent authorities as required by applicable law (for example, PRODHAB in Costa Rica or the SIC in Colombia) and without undue delay.",
        },
      ],
    },
    {
      id: "cookies",
      title: "16. Cookies",
      blocks: [
        {
          type: "p",
          text: "We use strictly necessary cookies and local storage to keep you signed in and remember your preferences, and analytics only if you opt in. Details are in our [Cookie Notice](/cookies).",
        },
      ],
    },
    {
      id: "changes",
      title: "17. Changes to this policy",
      blocks: [
        {
          type: "p",
          text: "We will post any update here with a new date. If a change is material — for example, a new purpose for using sensitive data — we will notify you in advance and, where the law requires, ask for your (or your parent's or guardian's) consent again.",
        },
      ],
    },
    {
      id: "contact",
      title: "18. Contact",
      blocks: [
        {
          type: "p",
          text: `${E.name} — ${E.product}. Privacy and data-protection requests: ${privacy}.`,
        },
      ],
    },
  ],
};
