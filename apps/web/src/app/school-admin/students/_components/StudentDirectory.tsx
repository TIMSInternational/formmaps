"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Download, GraduationCap, Loader2, Search, UserCog, X,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudentDirectory } from "@/hooks/useStudentRecord";
import {
  getStudentDirectoryCsvBlob, saveBlob, type DirectoryCell, type DirectoryStudent, type RecordLang, type StudentRecordStatus,
} from "@/services/studentRecordService";
import {
  DEFAULT_DIRECTORY_QUERY, DIRECTORY_KEYS, isFiltered, readDirectoryQuery, studentHref, studentsListHref,
  type DirectoryKey, type DirectoryQuery,
} from "@/lib/studentDirectory";

const STATUS_STYLE: Record<StudentRecordStatus, { bg: string; color: string; Icon: typeof Circle }> = {
  completed: { bg: "rgba(16,185,129,0.12)", color: "#059669", Icon: CheckCircle2 },
  in_progress: { bg: "rgba(59,130,246,0.12)", color: "var(--admin-accent-blue)", Icon: Clock },
  not_started: { bg: "transparent", color: "var(--admin-font-light)", Icon: Circle },
};

const SORTS = ["name:asc", "name:desc", "grade:asc", "progress:desc", "progress:asc"] as const;
const ALL = "all";

const fieldStyle: React.CSSProperties = {
  background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)",
};

const buttonStyle = (variant: "primary" | "outline", disabled = false): React.CSSProperties => ({
  height: 36, borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 600,
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  ...(variant === "primary"
    ? { background: "#102B47", color: "#fff", border: "none" }
    : { background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", border: "1px solid var(--admin-border-default)" }),
});

/**
 * Students → every student of the school with the status of each assessment. A row opens the
 * student's "Results & Answers"; the list's filters travel with it (Back and previous / next).
 */
export function StudentDirectory() {
  const { t, i18n } = useTranslation("school_admin");
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = readDirectoryQuery(searchParams);
  const uiLang: RecordLang = i18n.language?.startsWith("es") ? "es" : "en";
  const { data, isLoading, isError, isFetching, refetch } = useStudentDirectory(q);

  const go = (next: DirectoryQuery) => router.replace(studentsListHref(next), { scroll: false });
  const update = (patch: Partial<DirectoryQuery>) => go({ ...q, ...patch, page: patch.page ?? 1 });

  // The search box updates the URL after a short pause, not on every keystroke.
  const [search, setSearch] = useState(q.search);
  useEffect(() => setSearch(q.search), [q.search]);
  useEffect(() => {
    if (search.trim() === q.search) return;
    const id = setTimeout(() => update({ search: search.trim() }), 300);
    return () => clearTimeout(id);
  }, [search]);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      saveBlob(await getStudentDirectoryCsvBlob(q, uiLang), t("studentDirectory.export.filename", { lang: uiLang }));
      toast.success(t("studentDirectory.export.done"));
    } catch {
      toast.error(t("studentDirectory.export.failed"));
    } finally {
      setExporting(false);
    }
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(uiLang === "es" ? "es-CO" : "en-US", { month: "short", day: "numeric", year: "numeric" });
  const title = (k: DirectoryKey) => t(`studentDirectory.assessments.${k}`);
  const short = (k: DirectoryKey) => t(`studentDirectory.short.${k}`);
  const statusText = (s: StudentRecordStatus) => t(`studentRecord.status.${s}`);
  const cellLabel = (k: DirectoryKey, c: DirectoryCell) =>
    [title(k), statusText(c.status), c.detail, c.completedAt ? t("studentDirectory.cell.completedOn", { date: fmtDate(c.completedAt) }) : null]
      .filter(Boolean).join(" · ");

  const items = data?.items ?? [];
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>
            {t("studentDirectory.title")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
            {data ? t("studentDirectory.subtitle", { count: data.schoolTotal }) : t("studentDirectory.subtitleLoading")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/school-admin/users" style={buttonStyle("outline")}>
            <UserCog style={{ width: 15, height: 15 }} /> {t("studentDirectory.manageUsers")}
          </Link>
          <button type="button" onClick={exportCsv} disabled={exporting || !data?.total} style={buttonStyle("primary", exporting || !data?.total)}>
            {exporting ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Download style={{ width: 15, height: 15 }} />}
            {t("studentDirectory.export.button")}
          </button>
        </div>
      </div>

      {/* How far the school is, per assessment (follows the search and grade filters) */}
      {data && data.schoolTotal > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" aria-label={t("studentDirectory.summary.label")}>
          {DIRECTORY_KEYS.map((k) => {
            const s = data.summary[k];
            const scope = s.completed + s.in_progress + s.not_started;
            const pct = scope ? Math.round((s.completed / scope) * 100) : 0;
            const active = q.assessment === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => update(active ? { assessment: "", state: "" } : { assessment: k, state: q.state || "not_started" })}
                aria-pressed={active}
                title={t("studentDirectory.summary.filterHint", { assessment: title(k) })}
                style={{
                  textAlign: "left", borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                  background: "var(--admin-bg-card)",
                  border: `1px solid ${active ? "var(--admin-accent-blue)" : "var(--admin-border-default)"}`,
                  boxShadow: active ? "0 0 0 1px var(--admin-accent-blue)" : "none",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {short(k)}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                  {s.completed}<span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-tertiary)" }}> / {scope}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "var(--admin-bg-hover)", marginTop: 6, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#10b981" }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input
            aria-label={t("studentDirectory.filters.searchLabel")}
            placeholder={t("studentDirectory.filters.searchPlaceholder")}
            className="pl-9 h-9 rounded-lg text-sm"
            style={fieldStyle}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 flex-wrap">
          <Select value={q.grade || ALL} onValueChange={(v) => update({ grade: v === ALL ? "" : v })}>
            <SelectTrigger aria-label={t("studentDirectory.filters.grade")} className="h-9 rounded-lg text-sm sm:w-[140px]" style={fieldStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("studentDirectory.filters.allGrades")}</SelectItem>
              {(data?.grades ?? []).map((g) => (
                <SelectItem key={g} value={String(g)}>{t("studentDirectory.filters.gradeN", { grade: g })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={q.assessment || ALL} onValueChange={(v) => update({ assessment: v === ALL ? "" : (v as DirectoryKey) })}>
            <SelectTrigger aria-label={t("studentDirectory.filters.assessment")} className="h-9 rounded-lg text-sm sm:w-[190px]" style={fieldStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("studentDirectory.filters.allAssessments")}</SelectItem>
              {DIRECTORY_KEYS.map((k) => <SelectItem key={k} value={k}>{title(k)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={q.state || ALL} onValueChange={(v) => update({ state: v === ALL ? "" : (v as StudentRecordStatus) })}>
            <SelectTrigger aria-label={t("studentDirectory.filters.status")} className="h-9 rounded-lg text-sm sm:w-[150px]" style={fieldStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("studentDirectory.filters.anyStatus")}</SelectItem>
              {(["not_started", "in_progress", "completed"] as const).map((s) => <SelectItem key={s} value={s}>{statusText(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={`${q.sort}:${q.dir}`}
            onValueChange={(v) => {
              const [sort, dir] = v.split(":") as [DirectoryQuery["sort"], DirectoryQuery["dir"]];
              update({ sort, dir });
            }}
          >
            <SelectTrigger aria-label={t("studentDirectory.filters.sort")} className="h-9 rounded-lg text-sm sm:w-[170px]" style={fieldStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s} value={s}>{t(`studentDirectory.sort.${s.replace(":", "_")}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          {isFiltered(q) && (
            <button type="button" onClick={() => { setSearch(""); go({ ...DEFAULT_DIRECTORY_QUERY, sort: q.sort, dir: q.dir }); }} style={buttonStyle("outline")}>
              <X style={{ width: 14, height: 14 }} /> {t("studentDirectory.filters.clear")}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 16 }} className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-10" style={{ background: "var(--admin-bg-hover)" }} />)}
          </div>
        ) : isError ? (
          <div role="alert" style={{ padding: "40px 16px", textAlign: "center" }}>
            <AlertCircle style={{ width: 28, height: 28, color: "#ef4444", margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, color: "var(--admin-font-secondary)", marginBottom: 12 }}>{t("studentDirectory.loadError")}</p>
            <button type="button" onClick={() => refetch()} style={buttonStyle("outline")}>{t("studentRecord.retry")}</button>
          </div>
        ) : data && data.schoolTotal === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center" }}>
            <GraduationCap style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 10px" }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)" }}>{t("studentDirectory.empty.title")}</h2>
            <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", margin: "6px auto 14px", maxWidth: 360 }}>{t("studentDirectory.empty.description")}</p>
            <Link href="/school-admin/users?invite=true" style={buttonStyle("primary")}>{t("studentDirectory.empty.invite")}</Link>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("studentDirectory.noMatches.title")}</p>
            <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", margin: "4px 0 12px" }}>{t("studentDirectory.noMatches.description")}</p>
            <button type="button" onClick={() => { setSearch(""); go(DEFAULT_DIRECTORY_QUERY); }} style={buttonStyle("outline")}>
              {t("studentDirectory.filters.clear")}
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto", opacity: isFetching ? 0.7 : 1, transition: "opacity 120ms" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ background: "var(--admin-bg-hover)", borderBottom: "1px solid var(--admin-border-default)" }}>
                  <Th>{t("studentDirectory.columns.student")}</Th>
                  <Th center>{t("studentDirectory.columns.grade")}</Th>
                  {DIRECTORY_KEYS.map((k) => <Th key={k} center title={title(k)}>{short(k)}</Th>)}
                  <Th center>{t("studentDirectory.columns.progress")}</Th>
                  <Th><span className="sr-only">{t("studentDirectory.columns.open")}</span></Th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <Row key={s.id} s={s} href={studentHref(s.id, q)} cellLabel={cellLabel}
                    openLabel={t("studentDirectory.openStudent", { name: s.name })}
                    progressLabel={t("studentDirectory.progress", { done: s.completed, total: DIRECTORY_KEYS.length })}
                    onOpen={() => router.push(studentHref(s.id, q))} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pages */}
      {data && data.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }} aria-live="polite">
            {t("studentDirectory.pagination.showing", { from, to, total: data.total })}
          </span>
          {data.pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })} style={buttonStyle("outline", data.page <= 1)}>
                <ChevronLeft style={{ width: 14, height: 14 }} /> {t("studentDirectory.pagination.previous")}
              </button>
              <span style={{ fontSize: 12, color: "var(--admin-font-secondary)" }}>
                {t("studentDirectory.pagination.page", { page: data.page, pages: data.pages })}
              </span>
              <button type="button" disabled={data.page >= data.pages} onClick={() => update({ page: data.page + 1 })} style={buttonStyle("outline", data.page >= data.pages)}>
                {t("studentDirectory.pagination.next")} <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ children, center, title }: { children: React.ReactNode; center?: boolean; title?: string }) {
  return (
    <th scope="col" title={title} style={{
      padding: "10px 12px", textAlign: center ? "center" : "left", whiteSpace: "nowrap",
      fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)",
    }}>
      {children}
    </th>
  );
}

function Row({ s, href, cellLabel, openLabel, progressLabel, onOpen }: {
  s: DirectoryStudent;
  href: string;
  cellLabel: (k: DirectoryKey, c: DirectoryCell) => string;
  openLabel: string;
  progressLabel: string;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <tr
      data-testid="student-row"
      onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) onOpen(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer", background: hover ? "var(--admin-bg-hover)" : "transparent" }}
    >
      <td style={{ padding: "10px 12px", minWidth: 200 }}>
        <Link href={href} aria-label={openLabel} style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", textDecoration: "none" }}>
          {s.name}
        </Link>
        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{s.email}</div>
      </td>
      <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 13, color: "var(--admin-font-secondary)" }}>
        {s.gradeLevel ?? "—"}
      </td>
      {DIRECTORY_KEYS.map((k) => <td key={k} style={{ padding: "8px 6px", textAlign: "center" }}><StatusChip cell={s.cells[k]} label={cellLabel(k, s.cells[k])} /></td>)}
      <td style={{ padding: "10px 12px", textAlign: "center" }} aria-label={progressLabel} title={progressLabel}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--admin-font-primary)" }}>{s.completed}</span>
        <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>/{DIRECTORY_KEYS.length}</span>
      </td>
      <td style={{ padding: "10px 8px", textAlign: "right" }}>
        <ChevronRight aria-hidden style={{ width: 16, height: 16, color: hover ? "var(--admin-accent-blue)" : "var(--admin-font-light)" }} />
      </td>
    </tr>
  );
}

function StatusChip({ cell, label }: { cell: DirectoryCell; label: string }) {
  const st = STATUS_STYLE[cell.status] ?? STATUS_STYLE.not_started;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-status={cell.status}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
        minWidth: 32, height: 24, padding: "0 7px", borderRadius: 12,
        background: st.bg, color: st.color, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
      }}
    >
      <st.Icon aria-hidden style={{ width: 13, height: 13 }} />
      {cell.detail && <span>{cell.detail}</span>}
    </span>
  );
}
