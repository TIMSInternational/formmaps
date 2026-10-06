"use client";

import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state/EmptyState";

/**
 * Shown instead of a school-only page (Transcript, Video, Book Counselor,
 * Recommendation letters) when a student with no school opens it by direct URL.
 * Explains why, instead of the old dead ends ("ask your school", empty staff
 * search, free slots with no counselor) — formmaps-platform#399.
 */
export function SchoolOnlyFeatureNotice() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        type="permission_denied"
        title={t("independentStudent.schoolOnly.title")}
        description={t("independentStudent.schoolOnly.description")}
        actionLabel={t("independentStudent.schoolOnly.action")}
        actionHref="/dashboard"
      />
    </div>
  );
}
