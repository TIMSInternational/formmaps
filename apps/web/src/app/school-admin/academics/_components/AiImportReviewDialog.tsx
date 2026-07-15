"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, FileText, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { curriculumKeys } from "@/hooks/useCurriculumQueries";

interface AiImportCourse {
  code: string;
  name: string;
  description?: string;
  department?: string;
  credits?: number;
  maxEnrollment?: number | null;
  frameworkType?: string;
  isHonors?: boolean;
  difficulty?: string;
}

interface AiImportData {
  courses: AiImportCourse[];
  summary: string;
}

interface AiImportReviewDialogProps {
  data: AiImportData | null;
  onClose: () => void;
  /** fired only after a SUCCESSFUL import confirm (not on cancel/dismiss) */
  onConfirmed?: () => void;
}

export function AiImportReviewDialog({ data, onClose, onConfirmed }: AiImportReviewDialogProps) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  if (!data) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const { apiRequest } = await import("@/lib/api/apiClient");
      const res = await apiRequest("/api/v1/school-admin/courses/ai-import/confirm", {
        method: "POST", data: { courses: data.courses },
      });
      const result = res.data ?? res;
      const parts: string[] = [];
      if (result.coursesCreated) parts.push(`${result.coursesCreated} custom courses created`);
      if (result.coursesLinked) parts.push(`${result.coursesLinked} linked to catalog`);
      if (result.coursesSkipped) parts.push(`${result.coursesSkipped} skipped`);
      toast.success(parts.join(", ") || "Import complete");
      queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
      onClose();
      onConfirmed?.();
    } catch {
      toast.error("Failed to create courses");
    } finally { setConfirming(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", width: "90vw" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: "var(--admin-font-primary)" }}>
            <Sparkles style={{ width: 18, height: 18, color: "#8b5cf6" }} />
            AI Import Review
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>{data.summary}</p>

          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 8 }}>
              <FileText style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />
              Courses ({data.courses.length})
            </h3>
            <div style={{ maxHeight: 500, overflowY: "auto", borderRadius: 6, border: "1px solid var(--admin-border-default)" }}>
              <Table>
                <TableHeader>
                  <TableRow style={{ background: "var(--admin-bg-hover)" }}>
                    <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Code</TableHead>
                    <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Name</TableHead>
                    <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Description</TableHead>
                    <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Dept</TableHead>
                    <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Cr.</TableHead>
                    <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Cap</TableHead>
                    <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.courses.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell style={{ fontSize: 12, fontFamily: "monospace", color: "var(--admin-font-primary)" }}>{c.code}</TableCell>
                      <TableCell style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>
                        <div>{c.name}</div>
                        {c.isHonors && <Badge style={{ fontSize: 9, marginTop: 2, background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "none" }}>Honors</Badge>}
                      </TableCell>
                      <TableCell style={{ fontSize: 11, color: "var(--admin-font-tertiary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.description}>{c.description || "\u2014"}</TableCell>
                      <TableCell style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{c.department}</TableCell>
                      <TableCell style={{ fontSize: 12, color: "var(--admin-font-primary)", textAlign: "center" }}>{c.credits}</TableCell>
                      <TableCell style={{ fontSize: 12, color: c.maxEnrollment ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)", textAlign: "center" }}>{c.maxEnrollment || "\u2014"}</TableCell>
                      <TableCell>
                        {c.frameworkType ? (
                          <Badge style={{ fontSize: 10, background: c.frameworkType === "AP" ? "#2E909820" : c.frameworkType === "IB" ? "#8b5cf620" : "#14b8a620", color: c.frameworkType === "AP" ? "#2E9098" : c.frameworkType === "IB" ? "#8b5cf6" : "#14b8a6", border: "none" }}>
                            {c.frameworkType}
                          </Badge>
                        ) : (
                          <Badge variant="outline" style={{ fontSize: 10 }}>{c.difficulty || "custom"}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

        </div>

        <DialogFooter className="gap-2">
          <button onClick={onClose} style={{
            height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 500,
            background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
            color: "var(--admin-font-secondary)", cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handleConfirm} disabled={confirming} style={{
            height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 8,
            background: "#14b8a6", color: "#fff", border: "none",
            cursor: confirming ? "wait" : "pointer", opacity: confirming ? 0.7 : 1,
          }}>
            {confirming ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Check style={{ width: 14, height: 14 }} />}
            {confirming ? "Creating..." : `Create ${data.courses.length} Courses`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
