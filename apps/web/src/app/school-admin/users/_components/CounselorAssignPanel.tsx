"use client";

import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  UserCheck, Search, Users,
  SortAsc, BarChart3,
} from "lucide-react";
import { useSchoolUsers } from "@/hooks/useSchoolProfileQueries";
import { useStudents } from "@/hooks/useSchoolAdmin";
import type { SchoolUser } from "@/types/assessmentConfig";
import { CounselorRow } from "./CounselorRow";

export function CounselorAssignPanel() {
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useSchoolUsers({ role: "counselor", limit: 100 });
  const { data: allStudentsData } = useStudents({ limit: 1000 });

  const [assignedByRow, setAssignedByRow] = useState<Record<string, string[]>>({});
  const reportAssigned = useCallback((counselorId: string, studentIds: string[]) => {
    setAssignedByRow(prev => {
      if (JSON.stringify(prev[counselorId]) === JSON.stringify(studentIds)) return prev;
      return { ...prev, [counselorId]: studentIds };
    });
  }, []);
  const globalAssignedIds = useMemo(() =>
    new Set(Object.values(assignedByRow).flat()),
  [assignedByRow]);

  const allCounselors = useMemo(() =>
    (users?.data ?? []).filter(
      (u: SchoolUser) =>
        ((u as SchoolUser & { roleName?: string }).roleName || u.role || "").toLowerCase().includes("counselor")
    ),
  [users]);

  const counselors = useMemo(() =>
    allCounselors.filter((u: SchoolUser) =>
      !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
    ),
  [allCounselors, search]);

  const totalStudents = allStudentsData?.total ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" style={{ background: "var(--admin-bg-hover)" }} />)}
        </div>
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          Counselor Caseload Management
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          View, compare, and manage student assignments across your counseling department. Click a student name to view their full profile.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { label: "Counselors", value: allCounselors.length, icon: UserCheck, color: "#065292" },
          { label: "Total Students", value: totalStudents, icon: Users, color: "#6b7280" },
          { label: "Avg Caseload", value: allCounselors.length > 0 ? Math.round(totalStudents / allCounselors.length) : 0, icon: BarChart3, color: "#065292" },
          { label: "Unassigned", value: "\u2014", sub: "Expand rows to view", icon: SortAsc, color: "#f59e0b" },
        ].map((stat) => (
          <div key={stat.label} style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: "16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em", marginTop: 2 }}>{stat.value}</div>
              {stat.sub && <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginTop: 1 }}>{stat.sub}</div>}
            </div>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: `${stat.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <stat.icon style={{ width: 18, height: 18, color: stat.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Table */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "var(--admin-bg-hover)",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #065292)" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Counseling Department</div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Expand a counselor to view caseload. Click student names to view profiles. Hover for reassign/remove.</div>
            </div>
          </div>
          <div className="relative" style={{ width: 280 }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
            <Input
              placeholder="Search staff members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs"
              style={{ borderRadius: 6, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
            />
          </div>
        </div>

        {counselors.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 16px" }}>
            <Search style={{ width: 28, height: 28, color: "var(--admin-font-tertiary)", margin: "0 auto 10px", opacity: 0.4 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>No Counselors Found</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 300, margin: "0 auto" }}>
              {search ? "Try adjusting your search terminology." : "You haven't added any counselors yet. Invite them from the Staff & Roles tab."}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Staff Member</TableHead>
                  <TableHead className="w-40" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Designation</TableHead>
                  <TableHead className="w-40" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Caseload</TableHead>
                  <TableHead className="w-40 text-right pr-4" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counselors.map((counselor) => (
                  <CounselorRow key={counselor.id} counselor={counselor} allCounselors={allCounselors} globalAssignedIds={globalAssignedIds} onReportAssigned={reportAssigned} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
