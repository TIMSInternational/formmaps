"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import CareerExplorer from "@/components/career/CareerExplorer";

export default function CareersPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="sr-only">{t("careers.title")}</h1>
      <CareerExplorer />
    </div>
  );
}
