"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Users, UserCheck, Clock } from "lucide-react";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { motion } from "motion/react";

interface ParentRow {
  id: string;
  parentName: string;
  parentEmail: string;
  parentUserId: string | null;
  isAccepted: boolean;
  acceptedAt: string | null;
  createdDate: string;
  students: { id: string; name: string | null; email: string; gradeLevel: string | null }[];
}

interface ParentsResponse {
  success: boolean;
  data: ParentRow[];
  total: number;
  totalPages: number;
  page: number;
  stats: { totalParents: number; linkedStudents: number; pendingInvites: number };
}

function useParents(params: { page: number; limit: number; search: string }) {
  return useQuery<ParentsResponse>({
    queryKey: ["school-admin", "parents", params],
    queryFn: () =>
      apiRequest<ParentsResponse>(
        `/school-admin/parents?page=${params.page}&limit=${params.limit}&search=${encodeURIComponent(params.search)}`
      ),
    staleTime: 1000 * 60 * 2,
  });
}

export default function ParentsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading } = useParents({ page, limit: 20, search: debouncedSearch });

  const parents = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats;

  const statItems = [
    {
      label: "Total Parents",
      value: isLoading ? "\u2014" : (stats?.totalParents?.toLocaleString() || "0"),
      icon: Users, trend: 0, sub: "linked to students",
    },
    {
      label: "Linked Students",
      value: isLoading ? "\u2014" : (stats?.linkedStudents?.toLocaleString() || "0"),
      icon: UserCheck, trend: 0, sub: "with parent links",
    },
    {
      label: "Pending Invites",
      value: isLoading ? "\u2014" : (stats?.pendingInvites?.toLocaleString() || "0"),
      icon: Clock, trend: 0, sub: "awaiting acceptance",
    },
  ];

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>
          Parents
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-light)" }}>
          View all parent-student links across your school
        </p>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input
            placeholder="Search by name or email..."
            className="pl-9 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {statItems.map((item) => (
          <AdminStatCard key={item.label} {...item} />
        ))}
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          borderRadius: 8, border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)", overflow: "hidden",
        }}
      >
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["Parent Name", "Parent Email", "Linked Student(s)", "Status", "Joined Date"].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{
                  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                  color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                }}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton columnCount={5} rowCount={5} />
            ) : parents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                  <Users className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
                  <p className="text-sm">No parents found</p>
                </TableCell>
              </TableRow>
            ) : (
              parents.map((parent) => (
                <TableRow
                  key={parent.id}
                  style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                  className="transition-colors"
                  onClick={() => {
                    if (parent.parentUserId) router.push(`/school-admin/users/${parent.parentUserId}`);
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <TableCell className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%",
                        background: "linear-gradient(135deg, #8b5cf6, #a78bfa)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 12, fontWeight: 600,
                      }}>
                        {parent.parentName?.charAt(0)?.toUpperCase() || "P"}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                        {parent.parentName || "Unnamed"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                    {parent.parentEmail}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {parent.students.map((s) => (
                        <Badge
                          key={s.id}
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: "var(--admin-border-default)",
                            color: "var(--admin-font-tertiary)",
                            background: "var(--admin-bg-hover)",
                          }}
                        >
                          {s.name || s.email}{s.gradeLevel ? ` (${s.gradeLevel})` : ""}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <Badge className="text-xs font-medium shadow-none border-0" style={{
                      background: parent.isAccepted ? "rgba(16,185,129,0.1)" : "rgba(234,179,8,0.1)",
                      color: parent.isAccepted ? "#10b981" : "#eab308",
                    }}>
                      {parent.isAccepted ? "Active" : "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>
                    {parent.createdDate ? new Date(parent.createdDate).toLocaleDateString() : "\u2014"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between p-3" style={{
          borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
        }}>
          <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>
            Page <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{page}</span> of{" "}
            <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1} className="h-7 rounded-md text-xs"
              style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages} className="h-7 rounded-md text-xs"
              style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
              Next
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
