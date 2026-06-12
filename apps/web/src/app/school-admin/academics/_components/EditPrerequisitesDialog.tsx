"use client";

import { useEffect, useMemo, useState } from "react";
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
  background: "#065292", color: "#fff", cursor: "pointer",
};
const CHIP: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px",
  borderRadius: 6, fontSize: 12, fontFamily: "monospace", fontWeight: 600,
  background: "rgba(6,82,146,0.08)", color: "#065292", border: "1px solid rgba(6,82,146,0.2)",
};

const norm = (code: string) => code.trim().toUpperCase();

interface EditPrerequisitesDialogProps {
  /** Course whose prerequisites are being edited; null = closed */
  course: PathwayCourse | null;
  onClose: () => void;
}

export function EditPrerequisitesDialog({ course, onClose }: EditPrerequisitesDialogProps) {
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

  // Seed selection from the target course's current prerequisites once the catalog loads
  useEffect(() => {
    if (!course || !target) { setSelectedIds([]); setUnresolvedCodes([]); setSearch(""); return; }
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
    if (!course) return;
    update.mutate(
      {
        courseId: course.courseId,
        payload: {
          prerequisiteRules: [{ type: "AND", courseIds: selectedIds }],
          corequisites: target?.corequisites ?? [],
        },
      },
      {
        onSuccess: () => { toast.success("Prerequisites updated"); onClose(); },
        onError: () => toast.error("Failed to update prerequisites"),
      },
    );
  }

  return (
    <Dialog open={!!course} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--admin-font-primary)" }}>
            Edit prerequisites — <span style={{ fontFamily: "monospace" }}>{course?.code}</span>
          </DialogTitle>
          <DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>
            {course?.name}. Pathways update automatically from prerequisite edges.
          </DialogDescription>
        </DialogHeader>

        {catalogLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 style={{ width: 24, height: 24, color: "#065292", animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current prerequisites */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", marginBottom: 6 }}>
                PREREQUISITES ({selected.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.map((c) => (
                  <span key={c.id} style={CHIP}>
                    {c.code}
                    <button aria-label={`Remove ${c.code}`} onClick={() => setSelectedIds((prev) => prev.filter((id) => id !== c.id))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 0 }}>
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  </span>
                ))}
                {selected.length === 0 && unresolvedCodes.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>None — add courses below</span>
                )}
              </div>
              {unresolvedCodes.length > 0 && (
                <p style={{ fontSize: 11, color: "#d97706", marginTop: 6 }}>
                  Not in catalog (removed on save): {unresolvedCodes.join(", ")}
                </p>
              )}
            </div>

            {/* School-catalog picker */}
            <div>
              <Input placeholder="Search your school catalog..." value={search} onChange={(e) => setSearch(e.target.value)}
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
                    No matching courses
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <button onClick={onClose} style={BTN_GHOST}>Cancel</button>
          <button onClick={handleSave} disabled={update.isPending || catalogLoading}
            style={{ ...BTN_PRIMARY, opacity: update.isPending || catalogLoading ? 0.7 : 1, cursor: update.isPending ? "wait" : "pointer" }}>
            {update.isPending && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
