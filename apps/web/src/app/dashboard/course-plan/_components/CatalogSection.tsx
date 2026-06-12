"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Loader2, Lightbulb } from "lucide-react";
import type { GlobalCourseRecommendation } from "@/types/coursePlan";
import type { SchoolCourse } from "./types";

const TERMS = ["Fall", "Spring"];

interface CatalogSectionProps {
  catalog: SchoolCourse[];
  plannedCourseIds: Set<string>;
  onAdd: (course: SchoolCourse, term: string) => void;
  busyId: string | null;
  /** assessment-based suggestions — clicking a chip searches the catalog for it */
  suggestions: GlobalCourseRecommendation[];
}

export function CatalogSection({
  catalog,
  plannedCourseIds,
  onAdd,
  busyId,
  suggestions,
}: CatalogSectionProps) {
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
          Add Classes
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--admin-font-tertiary)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search classes..."
              className="h-8 w-52 rounded-md pl-8 pr-2 text-sm outline-none"
              style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            />
          </div>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Term"
            className="h-8 rounded-md px-2 text-sm outline-none"
            style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
          >
            {TERMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Assessment-based suggestion chips */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
            <Lightbulb className="h-3 w-3" />
            Suggested for you:
          </span>
          {suggestions.slice(0, 6).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSearch(s.title)}
              className="text-[11px] px-2 py-1 rounded-full border border-[#065292]/30 text-[#065292] hover:bg-blue-50"
              title={`${s.matchScore}% match — search the catalog for this`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {filteredCatalog.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: "var(--admin-font-tertiary)" }}>
          {catalog.length === 0 ? "Your school has no course catalog yet." : "No matching classes."}
        </p>
      ) : (
        <ul className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: "var(--admin-border-light)" }}>
          {filteredCatalog.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>
                  {c.name}
                  {c.isHonors && (
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#FFD600", color: "#111" }}>
                      HONORS
                    </span>
                  )}
                </p>
                <p className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                  {c.code} · {c.department ?? "—"} · {c.credits ?? "—"} credits
                </p>
              </div>
              <button
                type="button"
                aria-label={`Add ${c.name}`}
                disabled={busyId === c.id}
                onClick={() => onAdd(c, term)}
                className="shrink-0 flex items-center gap-1 px-3 h-8 rounded-md text-xs font-semibold"
                style={{ background: "var(--admin-accent-blue, #065292)", color: "#fff", opacity: busyId === c.id ? 0.6 : 1 }}
              >
                {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
