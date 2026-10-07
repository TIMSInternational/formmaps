"use client";

import { useTranslation } from "react-i18next";
import { ArrowLeft, Building2, Repeat } from "lucide-react";
import { clearActingSchool, leaveSchool } from "@/lib/actingSchool";

/**
 * Shown to a Super Admin inside a school: which school every action on this page applies to, and the two ways
 * out. Switching reloads to the picker so nothing cached from this school is shown under the next one.
 * `studentOnly`: a single student opened from Admin → Users with no school open (an independent student).
 */
export function ActingSchoolBar({ schoolName, studentOnly = false }: { schoolName?: string; studentOnly?: boolean }) {
  const { t } = useTranslation("school_admin");

  const switchSchool = () => {
    clearActingSchool();
    window.location.assign("/school-admin");
  };

  return (
    <div
      role="status"
      data-testid="acting-school-bar"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        marginBottom: 16,
        borderRadius: 8,
        border: "1px solid var(--admin-accent-blue, #3b82f6)",
        background: "var(--admin-bg-card)",
      }}
    >
      <Building2 style={{ width: 16, height: 16, color: "var(--admin-accent-blue, #3b82f6)", flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "var(--admin-font-primary)", flex: 1, minWidth: 200 }}>
        {studentOnly
          ? t("actingSchool.viewingStudentOnly")
          : t("actingSchool.viewing", { school: schoolName || t("actingSchool.thisSchool") })}
      </span>
      {!studentOnly && (
        <button type="button" onClick={switchSchool} style={barButton}>
          <Repeat style={{ width: 13, height: 13 }} />
          {t("actingSchool.switch")}
        </button>
      )}
      <button type="button" onClick={() => leaveSchool()} style={barButton}>
        <ArrowLeft style={{ width: 13, height: 13 }} />
        {t("actingSchool.backToAdmin")}
      </button>
    </div>
  );
}

const barButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 6,
  border: "1px solid var(--admin-border-default)",
  background: "var(--admin-bg-hover)",
  color: "var(--admin-font-primary)",
  cursor: "pointer",
};
