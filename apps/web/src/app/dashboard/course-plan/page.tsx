"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Trash2, Search, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api/apiClient";
import {
  getMyCoursePlan,
  addCourseToPlan,
  removeCourseFromPlan,
  getMyChangeRequests,
  cancelChangeRequest,
} from "@/services/coursePlanService";

interface SchoolCourse {
  id: string;
  code: string;
  name: string;
  department?: string;
  credits?: string | number;
  gradeLevels?: number[];
  isHonors?: boolean;
}

interface PlanEnrollment {
  id: string;
  courseId: string;
  term?: string | null;
  status: string;
}

interface ChangeRequest {
  id: string;
  courseName?: string;
  action?: string;
  status: string;
  studentNote?: string;
}

const TERMS = ["Fall", "Spring"];

export default function CoursePlanPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [enrollments, setEnrollments] = useState<PlanEnrollment[]>([]);
  const [gradeLevel, setGradeLevel] = useState<number | null>(null);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [catalog, setCatalog] = useState<SchoolCourse[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("Fall");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [plan, catalogRes, crs] = await Promise.all([
        getMyCoursePlan(),
        apiRequest("/api/v1/school-admin/courses?limit=100"),
        getMyChangeRequests({ limit: 10 }).catch(() => ({ data: [] })),
      ]);
      setEnrollments(plan?.plan?.enrollments ?? []);
      setGradeLevel(plan?.plan?.gradeLevel ?? null);
      // The student endpoint returns totalCreditsEarned flat; the typed shape nests it
      const planRaw = plan?.plan as unknown as { totalCreditsEarned?: number; graduationProgress?: { totalCreditsEarned?: number } };
      setCreditsEarned(Number(planRaw?.totalCreditsEarned ?? planRaw?.graduationProgress?.totalCreditsEarned ?? 0));
      const courses = catalogRes?.data?.data ?? catalogRes?.data ?? [];
      setCatalog(Array.isArray(courses) ? courses : []);
      const crList = (crs as { data?: ChangeRequest[] })?.data ?? [];
      setRequests(Array.isArray(crList) ? crList : []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const courseById = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog],
  );
  const plannedCourseIds = useMemo(
    () => new Set(enrollments.map((e) => e.courseId)),
    [enrollments],
  );

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

  const handleAdd = async (course: SchoolCourse) => {
    setBusyId(course.id);
    try {
      await addCourseToPlan({
        courseId: course.id,
        gradeLevel: gradeLevel ?? 9,
        semester: term,
      });
      toast.success(`${course.name} added to your plan`);
      await load();
    } catch {
      toast.error("Failed to add class");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (enrollment: PlanEnrollment, name: string) => {
    setBusyId(enrollment.courseId);
    try {
      // The API removes planned entries by courseId
      await removeCourseFromPlan(enrollment.courseId);
      toast.success(`${name} removed from your plan`);
      await load();
    } catch {
      toast.error("Failed to remove class");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelRequest = async (id: string) => {
    try {
      await cancelChangeRequest(id);
      toast.success("Request cancelled");
      await load();
    } catch {
      toast.error("Failed to cancel request");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-2">
        <Skeleton className="h-8 w-56" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-40 w-full" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-64 w-full" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-sm mb-3" style={{ color: "var(--admin-font-secondary)" }}>
          Failed to load your course plan.
        </p>
        <button
          type="button"
          onClick={() => { setLoading(true); load(); }}
          className="px-4 py-2 rounded-md text-sm font-semibold"
          style={{ background: "var(--admin-accent-blue, #065292)", color: "#fff" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" style={{ color: "var(--admin-accent-blue, #065292)" }} />
          <h1 className="text-xl font-bold" style={{ color: "var(--admin-font-primary)" }}>
            Course Plan
          </h1>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--admin-font-secondary)" }}>
          Plan your classes for the year{gradeLevel ? ` · Grade ${gradeLevel}` : ""} · {creditsEarned} credits earned
        </p>
      </div>

      {/* My plan */}
      <section
        className="rounded-xl p-4"
        style={{ background: "var(--admin-bg-panel)", border: "1px solid var(--admin-border-default)" }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--admin-font-primary)" }}>
          My Classes ({enrollments.length})
        </h2>
        {enrollments.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--admin-font-tertiary)" }}>
            No classes planned yet — add some from the catalog below.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--admin-border-light)" }}>
            {enrollments.map((e) => {
              const course = courseById.get(e.courseId);
              const name = course?.name ?? "Unknown course";
              return (
                <li key={e.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>
                      {name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                      {course?.code ?? e.courseId} · {course?.credits ?? "—"} credits
                      {e.term ? ` · ${e.term}` : ""} · {e.status}
                    </p>
                  </div>
                  {e.status === "planned" && (
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      disabled={busyId === e.courseId}
                      onClick={() => handleRemove(e, name)}
                      className="shrink-0 p-2 rounded-md transition-colors hover:bg-red-50"
                      style={{ color: "#dc2626" }}
                    >
                      {busyId === e.courseId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Catalog */}
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
                  onClick={() => handleAdd(c)}
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

      {/* Change requests */}
      {requests.length > 0 && (
        <section
          className="rounded-xl p-4"
          style={{ background: "var(--admin-bg-panel)", border: "1px solid var(--admin-border-default)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="h-4 w-4" style={{ color: "var(--admin-font-tertiary)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--admin-font-primary)" }}>
              My Change Requests
            </h2>
          </div>
          <ul className="divide-y" style={{ borderColor: "var(--admin-border-light)" }}>
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm truncate" style={{ color: "var(--admin-font-primary)" }}>
                    {r.action ? `${r.action} — ` : ""}{r.courseName ?? "Course"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>{r.status}</p>
                </div>
                {r.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleCancelRequest(r.id)}
                    className="text-xs font-medium shrink-0"
                    style={{ color: "#dc2626" }}
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
