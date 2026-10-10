"use client";

import { useTranslation } from "react-i18next";
import { RecommendationInbox } from "@/components/recommendations/RecommendationInbox";

export default function CoachRecommendationsPage() {
  const { t } = useTranslation();
  return <RecommendationInbox roleLabel={t("dashboard.role.coach")} />;
}
