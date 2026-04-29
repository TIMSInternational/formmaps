"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { CareerManager } from "./_components/CareerManager";

export default function AdminCareersPage() {
  const { isAdmin, loading } = useAdminAccess();
  const { t } = useTranslation();

  if (loading) return <div>{t("admin.careers.loading")}</div>;
  if (!isAdmin) return <div>{t("admin.accessDenied")}</div>;

  return <CareerManager />;
}
