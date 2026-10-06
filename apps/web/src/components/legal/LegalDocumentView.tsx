"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { useContentLanguage } from "@/lib/i18n/contentLanguage";
import { applyLanguage } from "@/lib/i18n/useSetLanguage";
import { getLegalDocument } from "@/lib/legal/content";
import { formatLegalDate } from "@/lib/legal/dates";
import { isExternalHref, parseInline } from "@/lib/legal/inline";
import type { LegalBlock } from "@/lib/legal/types";
import { LEGAL_DOCUMENT_VERSIONS, LEGAL_EFFECTIVE_DATE, type LegalDocumentKey } from "@/lib/legal/versions";
import { LegalFooter } from "./LegalFooter";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((tok, i) => {
        if (tok.kind === "text") return <Fragment key={i}>{tok.text}</Fragment>;
        if (tok.kind === "bold") return <strong key={i}>{tok.text}</strong>;
        const cls = "underline underline-offset-2 text-[var(--admin-accent-blue)]";
        return isExternalHref(tok.href) ? (
          <a key={i} href={tok.href} className={cls} rel="noopener noreferrer">
            {tok.text}
          </a>
        ) : (
          <Link key={i} href={tok.href} className={cls}>
            {tok.text}
          </Link>
        );
      })}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "p")
    return (
      <p className="leading-7">
        <Inline text={block.text} />
      </p>
    );
  if (block.type === "ul")
    return (
      <ul className="list-disc pl-6 space-y-2 leading-7">
        {block.items.map((item, i) => (
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </ul>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {block.head.map((h, i) => (
              <th key={i} scope="col" className="text-left font-semibold border-b border-gray-300 py-2 pr-4 align-bottom">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className="border-b border-gray-100 align-top">
              {row.map((cell, c) => (
                <td key={c} className="py-2 pr-4">
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Shared layout for every public legal document: title, version + effective date, language switch,
 * table of contents, sections, and the legal footer. Content comes from src/lib/legal/content in the
 * app's current language (useContentLanguage), so EN and ES never mix on one page.
 */
export function LegalDocumentView({ docKey }: { docKey: LegalDocumentKey }) {
  const { t } = useTranslation("legal");
  const lang = useContentLanguage();
  const doc = getLegalDocument(docKey, lang);
  const version = LEGAL_DOCUMENT_VERSIONS[docKey];

  return (
    <div className="min-h-dvh flex flex-col bg-white text-gray-800">
      <header className="w-full border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold tracking-tight" aria-label={t("layout.backHome")}>
            <span style={{ color: "#102B47" }}>FORM</span>
            <span style={{ color: "var(--admin-accent-blue)" }}>MAPS</span>
          </Link>
          <div role="group" aria-label={t("layout.languageLabel")} className="flex gap-1 text-xs">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => applyLanguage(l)}
                aria-pressed={lang === l}
                className={`rounded px-2 py-1 ${lang === l ? "bg-[#102B47] text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {l === "en" ? t("layout.english") : t("layout.spanish")}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-12" lang={lang}>
        <h1 className="text-3xl font-bold mb-2" style={{ color: "#102B47" }}>
          {doc.title}
        </h1>
        <p className="text-sm text-gray-500" data-testid="legal-effective">
          {t("layout.effective", { date: formatLegalDate(LEGAL_EFFECTIVE_DATE, lang) })} ·{" "}
          {t("layout.version", { version })}
        </p>
        <p className="mt-6 leading-7 rounded-lg bg-slate-50 p-4">{doc.summary}</p>

        <nav aria-labelledby="legal-toc" className="mt-8 rounded-lg border border-gray-200 p-4">
          <h2 id="legal-toc" className="text-sm font-semibold mb-2">
            {t("layout.tableOfContents")}
          </h2>
          <ol className="space-y-1 text-sm">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:underline text-[var(--admin-accent-blue)]">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-10">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-6 space-y-3">
              <h2 id={`${s.id}-title`} className="text-xl font-semibold" style={{ color: "#102B47" }}>
                {s.title}
              </h2>
              {s.blocks.map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </section>
          ))}
        </div>
      </main>

      <LegalFooter className="border-t border-gray-100" />
    </div>
  );
}
