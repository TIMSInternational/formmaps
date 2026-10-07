"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Building2, ChevronRight, Search } from "lucide-react";
import { getSchools } from "@/services/schoolService";
import { leaveSchool, openSchool } from "@/lib/actingSchool";
import type { School } from "@/types/school";

/**
 * What a Super Admin sees on any school-admin page before choosing a school: a searchable list of every school.
 * Choosing one opens the page the Super Admin was trying to reach, now acting as that school.
 */
export function SchoolPicker() {
  const { t } = useTranslation("school_admin");
  const [search, setSearch] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Debounced, and searched on the server: the list endpoint returns at most 50 schools per page.
    const timer = setTimeout(async () => {
      try {
        const res = await getSchools({ search: search.trim() || undefined, limit: 50 });
        if (!cancelled) {
          setSchools(Array.isArray(res?.data) ? res.data : []);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const choose = (school: School) =>
    openSchool({ id: school.id, name: school.name }, window.location.pathname + window.location.search);

  return (
    <div data-testid="school-picker" style={{ maxWidth: 720, margin: "0 auto", padding: "24px 0" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--admin-font-primary)", margin: 0 }}>
        {t("actingSchool.pickerTitle")}
      </h1>
      <p style={{ fontSize: 14, color: "var(--admin-font-secondary)", margin: "6px 0 20px" }}>
        {t("actingSchool.pickerDescription")}
      </p>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "var(--admin-font-tertiary)" }}
        />
        <input
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("actingSchool.searchPlaceholder")}
          aria-label={t("actingSchool.searchPlaceholder")}
          style={{
            width: "100%",
            padding: "10px 12px 10px 36px",
            fontSize: 14,
            borderRadius: 8,
            border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)",
            color: "var(--admin-font-primary)",
          }}
        />
      </div>

      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        {loading ? (
          <p style={emptyText}>{t("actingSchool.loading")}</p>
        ) : failed ? (
          <p style={emptyText}>{t("actingSchool.loadFailed")}</p>
        ) : schools.length === 0 ? (
          <p style={emptyText}>{t("actingSchool.noSchools")}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {schools.map((school, i) => (
              <li key={school.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--admin-border-default)" }}>
                <button
                  type="button"
                  onClick={() => choose(school)}
                  data-testid="school-picker-option"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "12px 14px",
                    border: "none",
                    background: "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "var(--admin-font-primary)",
                  }}
                >
                  <Building2 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{school.name}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--admin-font-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {school.adminEmail}
                    </span>
                  </span>
                  <ChevronRight style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)", flexShrink: 0 }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => leaveSchool()}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, padding: 0, border: "none", background: "none", fontSize: 13, color: "var(--admin-font-secondary)", cursor: "pointer" }}
      >
        <ArrowLeft style={{ width: 13, height: 13 }} />
        {t("actingSchool.backToAdmin")}
      </button>
    </div>
  );
}

const emptyText: React.CSSProperties = {
  margin: 0,
  padding: "20px 14px",
  fontSize: 13,
  color: "var(--admin-font-tertiary)",
  textAlign: "center",
};
