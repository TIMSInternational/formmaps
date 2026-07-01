"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/apiClient";

interface SearchStudent {
  id: string;
  name: string;
  email: string;
  gradeLevel?: string | null;
}

export function AssignStudentsModal({
  counselorId,
  counselorName,
  alreadyAssignedIds,
  onClose,
  onSuccess,
}: {
  counselorId: string;
  counselorName: string;
  alreadyAssignedIds: Set<string>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation("school_admin");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchStudent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const searchParam = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
        const res = await apiRequest(`/api/v1/school-admin/students?limit=50${searchParam}`);
        setResults(res?.data ?? res ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, search.trim() ? 300 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const toggleStudent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setAssigning(true);
    try {
      await apiRequest(`/api/v1/school-admin/counselors/${counselorId}/assign-students`, {
        method: "POST",
        data: { studentIds: Array.from(selected) },
      });
      toast.success(t("counselorWorkload.assignModal.assignSuccess", { count: selected.size, name: counselorName }));
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast.error(t("counselorWorkload.assignModal.assignFailed"), { description: message });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, maxHeight: "80vh", borderRadius: 12, overflow: "hidden",
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--admin-border-light)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("counselorWorkload.assignModal.title")}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{t("counselorWorkload.assignModal.to", { name: counselorName })}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px" }}>
          <input
            type="text"
            placeholder={t("counselorWorkload.assignModal.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
              border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
              color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
            }}
          />
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>{t("counselorWorkload.assignModal.loading")}</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>
              {search.trim() ? t("counselorWorkload.assignModal.noMatch") : t("counselorWorkload.assignModal.noStudents")}
            </div>
          ) : (
            results.map((s) => {
              const alreadyAssigned = alreadyAssignedIds.has(s.id);
              return (
                <label
                  key={s.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                    borderRadius: 8, cursor: alreadyAssigned ? "default" : "pointer",
                    background: selected.has(s.id) ? "var(--admin-bg-hover)" : "transparent",
                    opacity: alreadyAssigned ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => { if (!alreadyAssigned) toggleStudent(s.id); }}
                    disabled={alreadyAssigned}
                    style={{ accentColor: "#102B47" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{s.email}</div>
                  </div>
                  {alreadyAssigned && (
                    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                      {t("counselorWorkload.assignModal.assigned")}
                    </span>
                  )}
                  {s.gradeLevel && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)" }}>
                      {t("counselorWorkload.assignModal.gradeShort", { grade: s.gradeLevel })}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--admin-border-light)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
            {t("counselorWorkload.assignModal.selected", { count: selected.size })}
          </span>
          <button
            onClick={handleAssign}
            disabled={selected.size === 0 || assigning}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: selected.size === 0 || assigning ? "var(--admin-bg-hover)" : "#2E9098",
              color: selected.size === 0 || assigning ? "var(--admin-font-tertiary)" : "#fff",
              border: "none", cursor: selected.size === 0 || assigning ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {assigning ? t("counselorWorkload.assignModal.assigning") : t("counselorWorkload.assignModal.assignSelected")}
          </button>
        </div>
      </div>
    </div>
  );
}
