"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useSchoolCourses, useUpdatePrerequisites } from "@/hooks/useCurriculumQueries";
import type { PathwayCourse, SchoolCourse } from "@/types/curriculum";

const BTN_GHOST: React.CSSProperties = {
  height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 500,
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  color: "var(--admin-font-secondary)", cursor: "pointer",
};
const BTN_PRIMARY: React.CSSProperties = {
  height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
  display: "flex", alignItems: "center", gap: 8, border: "none",
  background: "#102B47", color: "#fff", cursor: "pointer",
};
const CHIP: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px",
  borderRadius: 6, fontSize: 12, fontFamily: "monospace", fontWeight: 600,
  background: "rgba(46,144,152,0.08)", color: "var(--admin-accent-blue)", border: "1px solid rgba(46,144,152,0.2)",
};

const norm = (code: string) => code.trim().toUpperCase();

interface EditPrerequisitesDialogProps {
  /** Course whose prerequisites are being edited; null = closed */
  course: PathwayCourse | null;
  onClose: () => void;
}

export function EditPrerequisitesDialog({ course, onClose }: EditPrerequisitesDialogProps) {
  const { t } = useTranslation("school_admin");
  const { data: catalogData, isLoading: catalogLoading } = useSchoolCourses({ limit: 500 });
  const update = useUpdatePrerequisites();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [unresolvedCodes, setUnresolvedCodes] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const catalog: SchoolCourse[] = useMemo(() => catalogData?.data ?? [], [catalogData]);
  const target = useMemo(
    () => catalog.find((c) => c.id === course?.courseId),
    [catalog, course?.courseId],
  );
  // The backend REPLACES prerequisites+corequisites wholesale on save, so a partial
  // catalog (or missing target row) would silently wipe data — block saving instead.
  const catalogIncomplete = !!catalogData && catalogData.total > catalog.length;
  const saveBlocked = catalogLoading || !target || catalogIncomplete;

  // Seed selection from the target's current prerequisites ONCE per opened course —
  // a background catalog refetch must not clobber in-progress edits.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!course) { seededFor.current = null; setSelectedIds([]); setUnresolvedCodes([]); setSearch(""); return; }
    if (!target || seededFor.current === course.courseId) return;
    seededFor.current = course.courseId;
    const byCode = new Map(catalog.map((c) => [norm(c.code), c]));
    const ids: string[] = [];
    const unresolved: string[] = [];
    (target.prerequisites ?? []).forEach((code) => {
      const match = byCode.get(norm(code));
      if (match) ids.push(match.id);
      else unresolved.push(code);
    });
    setSelectedIds(ids);
    setUnresolvedCodes(unresolved);
    setSearch("");
  }, [course, target, catalog]);

  const selected = selectedIds
    .map((id) => catalog.find((c) => c.id === id))
    .filter((c): c is SchoolCourse => Boolean(c));

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((c) => c.id !== course?.courseId && !selectedIds.includes(c.id))
      .filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [catalog, course?.courseId, selectedIds, search]);

  function handleSave() {
    if (!course || saveBlocked) return;
    update.mutate(
      {
        courseId: course.courseId,
        payload: {
          prerequisiteRules: [{ type: "AND", courseIds: selectedIds }],
          corequisites: target?.corequisites ?? [],
        },
      },
      {
        onSuccess: () => { toast.success(t("ui.prereqs.updated")); onClose(); },
        onError: () => toast.error(t("ui.prereqs.updateFailed")),
      },
    );
  }

  return (
    <Dialog open={!!course} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--admin-font-primary)" }}>
            {t("ui.prereqs.editTitle")} — <span style={{ fontFamily: "monospace" }}>{course?.code}</span>
          </DialogTitle>
          <DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>
            {t("ui.prereqs.editDescription", { name: course?.name })}
          </DialogDescription>
        </DialogHeader>

        {catalogLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 style={{ width: 24, height: 24, color: "var(--admin-accent-blue)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current prerequisites */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", marginBottom: 6 }}>
                {t("ui.prereqs.countLabel", { count: selected.length })}
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.map((c) => (
                  <span key={c.id} style={CHIP}>
                    {c.code}
                    <button aria-label={t("ui.prereqs.remove", { code: c.code })} onClick={() => setSelectedIds((prev) => prev.filter((id) => id !== c.id))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 0 }}>
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  </span>
                ))}
                {selected.length === 0 && unresolvedCodes.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("ui.prereqs.noneAddBelow")}</span>
                )}
              </div>
              {unresolvedCodes.length > 0 && (
                <p style={{ fontSize: 11, color: "#d97706", marginTop: 6 }}>
                  {t("ui.prereqs.notInCatalog", { codes: unresolvedCodes.join(", ") })}
                </p>
              )}
            </div>

            {!catalogLoading && (!target || catalogIncomplete) && (
              <p style={{ fontSize: 12, color: "#dc2626" }}>
                {!target
                  ? t("ui.prereqs.targetMissing")
                  : t("ui.prereqs.catalogTooLarge")}
              </p>
            )}

            {/* School-catalog picker */}
            <div>
              <Input aria-label={t("ui.prereqs.searchCatalogAria")} placeholder={t("ui.prereqs.searchCatalog")} value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", borderRadius: 6, color: "var(--admin-font-primary)", height: 36, fontSize: 13 }} />
              <div className="mt-2 overflow-y-auto" style={{ maxHeight: 220, borderRadius: 6, border: "1px solid var(--admin-border-default)" }}>
                {candidates.map((c) => (
                  <button key={c.id} onClick={() => setSelectedIds((prev) => [...prev, c.id])}
                    className="w-full text-left"
                    style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "8px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.code}</span>
                    <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{c.name}</span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <div style={{ padding: "16px 12px", fontSize: 12, color: "var(--admin-font-tertiary)", textAlign: "center" }}>
                    {t("ui.prereqs.noMatches")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <button onClick={onClose} style={BTN_GHOST}>{t("common.cancel")}</button>
          <button onClick={handleSave} disabled={update.isPending || saveBlocked}
            style={{ ...BTN_PRIMARY, opacity: update.isPending || saveBlocked ? 0.7 : 1, cursor: update.isPending ? "wait" : saveBlocked ? "not-allowed" : "pointer" }}>
            {update.isPending && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
            {t("common.save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
