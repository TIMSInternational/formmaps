"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SchoolUser } from "@/types/assessmentConfig";

interface ReassignStudentInfo {
  id: string;
  name?: string;
}

interface ReassignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: ReassignStudentInfo;
  currentCounselorId: string;
  counselors: SchoolUser[];
  onReassigned: () => void;
}

export function ReassignDialog({
  open,
  onOpenChange,
  student,
  currentCounselorId,
  counselors,
  onReassigned,
}: ReassignDialogProps) {
  const [targetId, setTargetId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const targets = counselors.filter((c) => c.id !== currentCounselorId);

  const handleReassign = async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const { assignStudents } = await import("@/services/schoolProfileService");
      await assignStudents(targetId, { studentIds: [student.id] });
      toast.success(`${student.name} reassigned successfully.`);
      onOpenChange(false);
      setTargetId("");
      onReassigned();
    } catch {
      toast.error("Failed to reassign student.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--admin-border-default)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <ArrowRightLeft style={{ width: 18, height: 18, color: "var(--admin-accent-blue, #065292)" }} />
              Reassign Student
            </DialogTitle>
            <DialogDescription style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
              Move <strong>{student?.name}</strong> to a different counselor&#39;s caseload.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div style={{ padding: 16 }} className="space-y-3">
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>
            Select New Counselor
          </div>
          <div style={{
            maxHeight: 250, overflow: "auto",
            border: "1px solid var(--admin-border-default)", borderRadius: 6,
            padding: 4, display: "flex", flexDirection: "column", gap: 2,
          }}>
            {targets.map((c) => (
              <label
                key={c.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                  border: targetId === c.id ? "1px solid var(--admin-accent-blue, #065292)" : "1px solid transparent",
                  background: targetId === c.id ? "rgba(59,130,246,0.05)" : "transparent",
                }}
                onClick={() => setTargetId(c.id)}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: targetId === c.id ? "rgba(59,130,246,0.15)" : "var(--admin-bg-hover)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: targetId === c.id ? "var(--admin-accent-blue, #065292)" : "var(--admin-font-primary)",
                }}>
                  {c.name?.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{c.email}</div>
                </div>
              </label>
            ))}
            {targets.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                No other counselors available.
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--admin-border-default)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={() => { onOpenChange(false); setTargetId(""); }}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600, background: "transparent",
              color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleReassign}
            disabled={!targetId || loading}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--admin-accent-blue, #065292)", color: "#fff",
              border: "none", cursor: "pointer",
              opacity: (!targetId || loading) ? 0.6 : 1,
            }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Reassign Student
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
