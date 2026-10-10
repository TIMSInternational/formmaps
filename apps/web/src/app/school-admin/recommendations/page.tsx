"use client";

import { useTranslation } from "react-i18next";
import { RecommendationInbox } from "@/components/recommendations/RecommendationInbox";

export default function SchoolAdminRecommendationsPage() {
  const { t } = useTranslation();
  return <RecommendationInbox roleLabel={t("dashboard.role.schooladmin")} />;
}
