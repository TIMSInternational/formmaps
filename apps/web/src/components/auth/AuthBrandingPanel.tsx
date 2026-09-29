"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

// Shared left-hand brand panel for the auth pages (login + signup) so both
// screens are visually identical. Solid FormMaps blue (var(--admin-accent-blue)) with the
// FORMMAPS wordmark, tagline, feature bullets, and decorative circles.
export function AuthBrandingPanel() {
  const { t } = useTranslation();
  return (
    <div
      className="hidden lg:flex lg:w-[48%] relative overflow-hidden"
      style={{ background: "#102B47" }}
    >
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col justify-center px-16 relative z-10"
      >
        {/* Logo */}
        <div className="mb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fm-full-white.png" alt="FormMaps" style={{ height: 40 }} />
        </div>

        <h1 className="text-4xl font-bold text-white leading-tight mb-4">
          {t("components.authBrandingPanel.headline")}
          <br />
          <span style={{ color: "#FFD23F" }}>{t("components.authBrandingPanel.headlineAccent")}</span>
        </h1>
        <p className="text-base mb-10" style={{ color: "rgba(255,255,255,0.75)", maxWidth: 420, lineHeight: 1.7 }}>
          {t("components.authBrandingPanel.tagline")}
        </p>

        <div className="flex flex-col gap-4">
          {[
            { icon: "graduation", text: t("components.authBrandingPanel.features.admissions") },
            { icon: "compass", text: t("components.authBrandingPanel.features.careers") },
            { icon: "chart", text: t("components.authBrandingPanel.features.insights") },
            { icon: "shield", text: t("components.authBrandingPanel.features.administration") },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-center gap-3"
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#FFD23F" }} />
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{item.text}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Decorative circles */}
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full" style={{ background: "rgba(255,214,0,0.08)" }} />
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
    </div>
  );
}
