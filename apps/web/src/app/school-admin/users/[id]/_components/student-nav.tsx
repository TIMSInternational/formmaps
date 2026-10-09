"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStudentNeighbors } from "@/hooks/useStudentRecord";
import { readDirectoryQuery, studentHref, studentsListHref } from "@/lib/studentDirectory";

const navButton = (disabled: boolean): React.CSSProperties => ({
  height: 32, borderRadius: 6, padding: "0 10px", fontSize: 12, fontWeight: 600,
  display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", whiteSpace: "nowrap",
  background: "var(--admin-bg-card)", color: "var(--admin-font-primary)",
  border: "1px solid var(--admin-border-default)",
  opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer", pointerEvents: disabled ? "none" : "auto",
});

/**
 * Students › Name, and ← Previous · 3 of 42 · Next → through the list the page was opened from
 * (its filters ride in the URL). The open tab is kept when moving to another student.
 * The list parts appear once the API answers: a Super Admin looking at one student with no school
 * open has no school list (the API refuses), so they see the name only.
 */
export function StudentNav({ studentId, studentName, tab }: {
  studentId: string;
  studentName: string;
  tab: string;
}) {
  const { t } = useTranslation("school_admin");
  const q = readDirectoryQuery(useSearchParams());
  const { data } = useStudentNeighbors(studentId, q);
  const hasList = !!data;
  const listHref = studentsListHref(q);
  const prevHref = data?.prev ? studentHref(data.prev.id, q, tab) : null;
  const nextHref = data?.next ? studentHref(data.next.id, q, tab) : null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <nav aria-label={t("studentDirectory.nav.breadcrumb")} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 13 }}>
        {hasList ? (
          <>
            <Link href={listHref} style={{ color: "var(--admin-accent-blue)", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <ChevronLeft aria-hidden style={{ width: 14, height: 14 }} />
              {t("studentDirectory.title")}
            </Link>
            <span aria-hidden style={{ color: "var(--admin-font-light)" }}>/</span>
          </>
        ) : null}
        <span aria-current="page" style={{ color: "var(--admin-font-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {studentName}
        </span>
      </nav>

      {hasList && data && data.position !== null && data.total > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href={prevHref ?? "#"}
            aria-disabled={!prevHref}
            tabIndex={prevHref ? undefined : -1}
            title={data.prev ? t("studentDirectory.nav.previousTitle", { name: data.prev.name }) : undefined}
            style={navButton(!prevHref)}
            onClick={(e) => { if (!prevHref) e.preventDefault(); }}
          >
            <ChevronLeft aria-hidden style={{ width: 14, height: 14 }} /> {t("studentDirectory.nav.previous")}
          </Link>
          <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", whiteSpace: "nowrap" }}>
            {t("studentDirectory.nav.position", { position: data.position, total: data.total })}
          </span>
          <Link
            href={nextHref ?? "#"}
            aria-disabled={!nextHref}
            tabIndex={nextHref ? undefined : -1}
            title={data.next ? t("studentDirectory.nav.nextTitle", { name: data.next.name }) : undefined}
            style={navButton(!nextHref)}
            onClick={(e) => { if (!nextHref) e.preventDefault(); }}
          >
            {t("studentDirectory.nav.next")} <ChevronRight aria-hidden style={{ width: 14, height: 14 }} />
          </Link>
        </div>
      )}
    </div>
  );
}

