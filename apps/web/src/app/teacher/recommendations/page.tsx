"use client";

import { useTranslation } from "react-i18next";
import { RecommendationInbox } from "@/components/recommendations/RecommendationInbox";

export default function TeacherRecommendationsPage() {
  const { t } = useTranslation("teacher");
  return <RecommendationInbox roleLabel={t("recommendations.roleLabel")} />;
}
