import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E } from "../../company";

const privacy = `[${C.privacyEmail}](mailto:${C.privacyEmail})`;

export const cookiesEn: LegalDocumentContent = {
  key: "cookies",
  locale: "en",
  title: "Cookie Notice",
  summary:
    "FormMaps uses a small number of cookies and browser storage items to keep you signed in and remember your choices. Analytics run only if you opt in. We do not use advertising cookies.",
  sections: [
    {
      id: "what",
      title: "1. What cookies and local storage are",
      blocks: [
        {
          type: "p",
          text: "Cookies are small files a website stores in your browser. Local storage is a similar browser feature that keeps data on your device. We use both only for the purposes below.",
        },
      ],
    },
    {
      id: "necessary",
      title: "2. Strictly necessary",
      blocks: [
        { type: "p", text: "These are needed for FormMaps to work and to keep your account secure. They cannot be switched off." },
        {
          type: "table",
          head: ["Name", "Type", "Purpose", "Duration"],
          rows: [
            ["access_token", "Cookie (HttpOnly, secure)", "Keeps you signed in", "Until your session expires"],
            ["refresh_token", "Cookie (HttpOnly, secure)", "Renews your session securely", "Until your session expires"],
            ["logged_in", "Cookie", "Tells the app you are signed in", "Until your session expires"],
            ["session_expires_at", "Cookie", "Warns you before your session times out", "Until your session expires"],
            ["telemetry_consent", "Local storage", "Remembers your cookie choices", "Until you clear it or we update this notice"],
            ["timcare-global-store", "Local storage", "Keeps your session state and preferences (such as language) in the app", "Until you sign out or clear it"],
            ["Assessment progress (mil_session_*, formmaps_pending_mil_submissions, onboarding_*)", "Local storage", "Saves your progress so you do not lose answers if the connection drops", "Until the assessment or onboarding is finished"],
          ],
        },
        {
          type: "p",
          text: "Our session cookies use the SameSite protection, which helps prevent cross-site request forgery.",
        },
      ],
    },
    {
      id: "preferences",
      title: "3. Preferences",
      blocks: [
        {
          type: "table",
          head: ["Name", "Type", "Purpose", "Duration"],
          rows: [
            ["i18nextLng", "Local storage", "Remembers your language (English or Spanish)", "Until you clear it"],
            ["admin-theme", "Local storage", "Remembers display settings in staff dashboards", "Until you clear it"],
          ],
        },
      ],
    },
    {
      id: "analytics",
      title: "4. Analytics (only if you opt in)",
      blocks: [
        {
          type: "p",
          text: "If you choose \"Accept All\" or switch on Analytics in the cookie banner, the app sends usage events (such as pages viewed and performance measurements) to FormMaps' own servers so we can improve the product. No third-party analytics service receives them. If you choose \"Necessary Only\", no analytics events are sent.",
        },
      ],
    },
    {
      id: "advertising",
      title: "5. No advertising cookies",
      blocks: [
        {
          type: "p",
          text: "We do not use advertising or cross-site tracking cookies, and we do not allow advertisers to place cookies through FormMaps. When you pay, you are taken to Stripe's checkout page, where Stripe uses its own cookies for payment security and fraud prevention under its own privacy policy.",
        },
      ],
    },
    {
      id: "manage",
      title: "6. How to manage your choices",
      blocks: [
        {
          type: "ul",
          items: [
            "Change your analytics choice by clearing the \"telemetry_consent\" item (or all site data) in your browser; the cookie banner will appear again.",
            "You can block or delete cookies in your browser settings. If you block strictly necessary cookies, you will not be able to sign in.",
            "Signing out removes the session cookies.",
          ],
        },
      ],
    },
    {
      id: "contact",
      title: "7. Changes and contact",
      blocks: [
        {
          type: "p",
          text: `We update this notice when the cookies we use change. Questions: ${privacy}. More about how we use personal data: [Privacy Policy](/privacy). ${E.name} — ${E.product}.`,
        },
      ],
    },
  ],
};
