"use client";

import { Trans, useTranslation } from "react-i18next";

export function PrivacyContent() {
  const { t } = useTranslation("common");

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">{t("pages.privacy.title")}</h1>
      <p className="text-sm text-muted-foreground mb-8">{t("pages.privacy.lastUpdated")}</p>

      <div className="prose prose-sm dark:prose-invert space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.privacy.s1.title")}</h2>
          <p>{t("pages.privacy.s1.intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>{t("pages.privacy.s1.item1Label")}</strong> {t("pages.privacy.s1.item1")}</li>
            <li><strong>{t("pages.privacy.s1.item2Label")}</strong> {t("pages.privacy.s1.item2")}</li>
            <li><strong>{t("pages.privacy.s1.item3Label")}</strong> {t("pages.privacy.s1.item3")}</li>
            <li><strong>{t("pages.privacy.s1.item4Label")}</strong> {t("pages.privacy.s1.item4")}</li>
            <li><strong>{t("pages.privacy.s1.item5Label")}</strong> {t("pages.privacy.s1.item5")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.privacy.s2.title")}</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("pages.privacy.s2.item1")}</li>
            <li>{t("pages.privacy.s2.item2")}</li>
            <li>{t("pages.privacy.s2.item3")}</li>
            <li>{t("pages.privacy.s2.item4")}</li>
            <li>{t("pages.privacy.s2.item5")}</li>
            <li>{t("pages.privacy.s2.item6")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.privacy.s3.title")}</h2>
          <p>{t("pages.privacy.s3.intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>{t("pages.privacy.s3.item1Label")}</strong> {t("pages.privacy.s3.item1")}</li>
            <li><strong>{t("pages.privacy.s3.item2Label")}</strong> {t("pages.privacy.s3.item2")}</li>
            <li><strong>{t("pages.privacy.s3.item3Label")}</strong> {t("pages.privacy.s3.item3")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.privacy.s4.title")}</h2>
          <p>{t("pages.privacy.s4.intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("pages.privacy.s4.item1")}</li>
            <li>{t("pages.privacy.s4.item2")}</li>
            <li>{t("pages.privacy.s4.item3")}</li>
            <li>{t("pages.privacy.s4.item4")}</li>
            <li>{t("pages.privacy.s4.item5")}</li>
            <li>{t("pages.privacy.s4.item6")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.privacy.s5.title")}</h2>
          <p>{t("pages.privacy.s5.intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("pages.privacy.s5.item1")}</li>
            <li>{t("pages.privacy.s5.item2")}</li>
            <li>{t("pages.privacy.s5.item3")}</li>
            <li>{t("pages.privacy.s5.item4")}</li>
            <li>{t("pages.privacy.s5.item5")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.privacy.s6.title")}</h2>
          <p>{t("pages.privacy.s6.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.privacy.s7.title")}</h2>
          <p>{t("pages.privacy.s7.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">{t("pages.privacy.s8.title")}</h2>
          <p>
            <Trans
              i18nKey="pages.privacy.s8.body"
              ns="common"
              components={{ link: <a href="mailto:privacy@formmaps.ai" className="text-[var(--admin-accent-blue)] underline" /> }}
            />
          </p>
        </section>
      </div>
    </main>
  );
}
