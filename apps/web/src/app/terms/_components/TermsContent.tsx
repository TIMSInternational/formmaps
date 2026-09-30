"use client";

import { Trans, useTranslation } from "react-i18next";

export function TermsContent() {
  const { t } = useTranslation("common");

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">{t("pages.terms.title")}</h1>
      <p className="text-sm text-muted-foreground mb-8">{t("pages.terms.lastUpdated")}</p>

      <div className="prose prose-sm dark:prose-invert space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s1.title")}</h2>
          <p>{t("pages.terms.s1.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s2.title")}</h2>
          <p>{t("pages.terms.s2.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s3.title")}</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("pages.terms.s3.item1")}</li>
            <li>{t("pages.terms.s3.item2")}</li>
            <li>{t("pages.terms.s3.item3")}</li>
            <li>{t("pages.terms.s3.item4")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s4.title")}</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("pages.terms.s4.item1")}</li>
            <li>{t("pages.terms.s4.item2")}</li>
            <li>{t("pages.terms.s4.item3")}</li>
            <li>{t("pages.terms.s4.item4")}</li>
            <li>{t("pages.terms.s4.item5")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s5.title")}</h2>
          <p>{t("pages.terms.s5.intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("pages.terms.s5.item1")}</li>
            <li>{t("pages.terms.s5.item2")}</li>
            <li>{t("pages.terms.s5.item3")}</li>
            <li>{t("pages.terms.s5.item4")}</li>
            <li>{t("pages.terms.s5.item5")}</li>
            <li>{t("pages.terms.s5.item6")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s6.title")}</h2>
          <p>{t("pages.terms.s6.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s7.title")}</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("pages.terms.s7.item1")}</li>
            <li>{t("pages.terms.s7.item2")}</li>
            <li>{t("pages.terms.s7.item3")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s8.title")}</h2>
          <p>{t("pages.terms.s8.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s9.title")}</h2>
          <p>{t("pages.terms.s9.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s10.title")}</h2>
          <p>{t("pages.terms.s10.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.terms.s11.title")}</h2>
          <p>
            <Trans
              i18nKey="pages.terms.s11.body"
              ns="common"
              components={{ link: <a href="mailto:legal@formmaps.ai" className="text-[var(--admin-accent-blue)] underline" /> }}
            />
          </p>
        </section>
      </div>
    </main>
  );
}
