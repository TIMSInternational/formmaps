"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Illustration } from "@/components/illustration/Illustration";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center max-w-md">
        <Illustration name="not-found" size={168} className="mx-auto mb-4" priority />
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--admin-accent-blue)] mb-2">404</p>
        <h2 className="text-2xl font-semibold mb-2">{t("error.notFound.title")}</h2>
        <p className="text-muted-foreground mb-8">
          {t("error.notFound.description")}
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-[var(--admin-accent-blue)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#256F76] transition-colors"
          >
            {t("error.notFound.goToDashboard")}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            {t("nav.home")}
          </Link>
        </div>
      </div>
    </main>
  );
}
