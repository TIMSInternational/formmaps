"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/api/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { Users } from "lucide-react";
import { CounselorCard } from "./_components/CounselorCard";
import type { CounselorWorkload } from "./_components/CounselorCard";

export default function CounselorWorkloadPage() {
  const { t } = useTranslation("school_admin");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<CounselorWorkload[]>({
    queryKey: ["counselor-workload"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/counselor-workload");
      return res?.data ?? res ?? [];
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["counselor-workload"] });
  const counselors = data ?? [];
  const totalStudents = counselors.reduce((s, c) => s + c.studentCount, 0);
  const totalSessions = counselors.reduce((s, c) => s + c.sessionCount, 0);

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>
          {t("counselorWorkload.label")}
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <Users style={{ width: 22, height: 22, color: "#065292" }} />
          {t("counselorWorkload.title")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {t("counselorWorkload.subtitle")}
        </p>
      </motion.div>

      {/* Summary stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}
      >
        {[
          { label: t("counselorWorkload.stats.counselors"), value: counselors.length, color: "#065292" },
          { label: t("counselorWorkload.stats.totalStudents"), value: totalStudents, color: "#14b8a6" },
          { label: t("counselorWorkload.stats.totalSessions"), value: totalSessions, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{
            padding: "16px 20px", borderRadius: 10,
            background: "var(--admin-bg-card)",
            border: "1px solid var(--admin-border-default)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Counselor cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" style={{ background: "var(--admin-bg-hover)", borderRadius: 12 }} />
          ))}
        </div>
      ) : counselors.length === 0 ? (
        <div style={{
          padding: 48, textAlign: "center", borderRadius: 12,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
        }}>
          <Users style={{ width: 36, height: 36, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)" }}>{t("counselorWorkload.noCounselors")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {counselors.map((c, i) => (
            <CounselorCard key={c.id} counselor={c} index={i} allCounselors={counselors} onRefetch={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
