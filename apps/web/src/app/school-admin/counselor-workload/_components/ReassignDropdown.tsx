"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/apiClient";

export interface CounselorWorkload {
  id: string;
  name: string;
  email: string;
  studentCount: number;
  sessionCount: number;
  noteCount: number;
  assignedStudents: {
    id: string;
    name: string;
    email: string;
    gradeLevel: string | null;
    isActive: boolean;
  }[];
}

export function ReassignDropdown({
  studentId,
  studentName,
  currentCounselorId,
  counselors,
  onSuccess,
}: {
  studentId: string;
  studentName: string;
  currentCounselorId: string;
  counselors: CounselorWorkload[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleReassign = async (newCounselorId: string) => {
    setReassigning(true);
    try {
      await apiRequest(`/api/v1/school-admin/counselors/${currentCounselorId}/assign-students`, {
        method: "DELETE",
        data: { studentIds: [studentId] },
      });
      await apiRequest(`/api/v1/school-admin/counselors/${newCounselorId}/assign-students`, {
        method: "POST",
        data: { studentIds: [studentId] },
      });
      const target = counselors.find((c) => c.id === newCounselorId);
      toast.success(`Reassigned ${studentName} to ${target?.name ?? "new counselor"}`);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast.error("Failed to reassign student", { description: message });
    } finally {
      setReassigning(false);
      setOpen(false);
    }
  };

  const otherCounselors = counselors.filter((c) => c.id !== currentCounselorId);
  if (otherCounselors.length === 0) return null;

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropdownHeight = (otherCounselors.length * 52) + 36;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < dropdownHeight + 8;
      setDropdownPos({
        top: openUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: Math.max(8, rect.right - 220),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        ref={btnRef}
        title="Reassign to another counselor"
        onClick={handleOpen}
        disabled={reassigning}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 4,
          color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center",
          opacity: reassigning ? 0.5 : 1,
        }}
      >
        <ArrowRightLeft style={{ width: 13, height: 13 }} />
      </button>
      {open && (
        <div style={{
          position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          borderRadius: 8, minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          padding: 4,
        }}>
          <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Reassign to
          </div>
          {otherCounselors.map((c) => (
            <button
              key={c.id}
              onClick={() => handleReassign(c.id)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                borderRadius: 6, fontSize: 13, color: "var(--admin-font-primary)",
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{c.studentCount} students</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
