"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { LEGAL_DOCUMENT_PATHS } from "@/lib/legal/versions";

const LINKS = [
  { href: LEGAL_DOCUMENT_PATHS.terms, key: "footer.terms" },
  { href: LEGAL_DOCUMENT_PATHS.privacy, key: "footer.privacy" },
  { href: LEGAL_DOCUMENT_PATHS.refunds, key: "footer.refunds" },
  { href: LEGAL_DOCUMENT_PATHS.cookies, key: "footer.cookies" },
  { href: LEGAL_DOCUMENT_PATHS["parental-consent"], key: "footer.parentalConsent" },
] as const;

/** Links to the five legal documents. Shown on every public page (landing, auth, subscribe, legal). */
export function LegalFooter({ className = "" }: { className?: string }) {
  const { t } = useTranslation("legal");
  return (
    <footer className={`w-full px-4 py-6 text-xs text-gray-500 ${className}`} data-testid="legal-footer">
      <nav aria-label={t("footer.navLabel")} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:underline">
            {t(l.key)}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-center">{String(t("footer.copyright", { year: new Date().getFullYear() }))}</p>
    </footer>
  );
}

export default LegalFooter;
