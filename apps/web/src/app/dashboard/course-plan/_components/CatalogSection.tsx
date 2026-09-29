"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search, Loader2, Lightbulb, Lock } from "lucide-react";
import type { GlobalCourseRecommendation } from "@/types/coursePlan";
import type { CourseEligibility } from "@/types/prereq";
import type { SchoolCourse } from "./types";

// Term values are data (sent to the API as-is); only their labels are translated.
const TERMS = ["Fall", "Spring"];

interface CatalogSectionProps {
  catalog: SchoolCourse[];
  plannedCourseIds: Set<string>;
  onAdd: (course: SchoolCourse, term: string) => void;
  busyId: string | null;
  /** assessment-based suggestions — clicking a chip searches the catalog for it */
  suggestions: GlobalCourseRecommendation[];
  /** prerequisite eligibility keyed by courseId */
  eligibility?: Map<string, CourseEligibility>;
}

export function CatalogSection({
  catalog,
  plannedCourseIds,
  onAdd,
  busyId,
  suggestions,
  eligibility,
}: CatalogSectionProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("Fall");

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(
      (c) =>
        !plannedCourseIds.has(c.id) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          (c.department || "").toLowerCase().includes(q)),
    );
  }, [catalog, plannedCourseIds, search]);

  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--admin-bg-panel)", border: "1px solid var(--admin-border-default)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--admin-font-primary)" }}>
          {t("coursePlan.catalog.title")}
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--admin-font-tertiary)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("coursePlan.catalog.searchPlaceholder")}
              className="h-8 w-52 rounded-md pl-8 pr-2 text-sm outline-none"
              style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            />
          </div>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label={t("coursePlan.catalog.term")}
            className="h-8 rounded-md px-2 text-sm outline-none"
            style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
          >
            {TERMS.map((termValue) => (
              <option key={termValue} value={termValue}>{t(`coursePlan.catalog.terms.${termValue}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Assessment-based suggestion chips */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
            <Lightbulb className="h-3 w-3" />
            {t("coursePlan.catalog.suggested")}
          </span>
          {suggestions.slice(0, 6).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSearch(s.title)}
              className="text-[11px] px-2 py-1 rounded-full border border-[var(--admin-accent-blue)]/30 text-[var(--admin-accent-blue)] hover:bg-[var(--admin-accent-blue)]/10"
              title={t("coursePlan.catalog.suggestionTitle", { score: s.matchScore })}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {filteredCatalog.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: "var(--admin-font-tertiary)" }}>
          {catalog.length === 0 ? t("coursePlan.catalog.emptyCatalog") : t("coursePlan.catalog.noMatches")}
        </p>
      ) : (
        <ul className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: "var(--admin-border-light)" }}>
          {filteredCatalog.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>
                  {c.name}
                  {c.isHonors && (
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#FFD23F", color: "#111" }}>
                      {t("studentUi.coursePlan.catalog.honors")}
                    </span>
                  )}
                  {(() => {
                    const entry = eligibility?.get(c.id);
                    if (entry && !entry.eligible && entry.missing.length > 0) {
                      return (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#fff7e6", color: "#d97706", border: "1px solid #d97706" }}>
                          <Lock className="h-3 w-3" />
                          {t("coursePlan.catalog.needs", { courses: entry.missing.join(", ") })}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </p>
                <p className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                  {c.code} · {c.department ?? "—"} · {t("coursePlan.catalog.credits", { credits: c.credits ?? "—" })}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("coursePlan.catalog.addAria", { name: c.name })}
                disabled={busyId === c.id}
                onClick={() => onAdd(c, term)}
                className="shrink-0 flex items-center gap-1 px-3 h-8 rounded-md text-xs font-semibold"
                style={{ background: "var(--admin-accent-blue)", color: "#fff", opacity: busyId === c.id ? 0.6 : 1 }}
              >
                {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {t("coursePlan.catalog.add")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
