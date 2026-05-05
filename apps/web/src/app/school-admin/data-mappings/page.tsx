"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft, Plus, Search, Loader2, Trash2, Sparkles, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useDataMappings,
  useCreateDataMapping,
  useDeleteDataMapping,
  useAIMappingSuggestions,
  useBulkApproveMappings,
} from "@/hooks/useDataMappingQueries";
import type { DataMappingPayload, ExternalSource } from "@/types/dataMapping";

export default function DataMappingsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading } = useDataMappings({
    search: search || undefined,
    status: statusFilter || undefined,
    page,
    limit: 20,
  });
  const create = useCreateDataMapping();
  const remove = useDeleteDataMapping();
  const aiSuggest = useAIMappingSuggestions();
  const bulkApprove = useBulkApproveMappings();

  const [form, setForm] = useState<DataMappingPayload>({
    externalCode: "",
    externalName: "",
    externalSource: "iSAMS",
    internalCourseId: "",
  });

  const handleCreate = () => {
    if (!form.externalCode || !form.internalCourseId) { toast.error("External code and internal course ID are required"); return; }
    create.mutate(form, {
      onSuccess: () => { toast.success("Mapping created"); setAddOpen(false); },
      onError: () => toast.error("Failed to create mapping"),
    });
  };

  const handleAISuggest = () => {
    aiSuggest.mutate(
      { unmappedCodes: data?.data?.filter((m) => m.status === "pending").map((m) => ({ externalCode: m.externalCode, externalName: m.externalName || "" })) || [] },
      {
        onSuccess: (result) => toast.success(`AI suggested ${result.suggestions.length} mappings`),
        onError: () => toast.error("AI suggestion failed"),
      }
    );
  };

  const handleBulkApprove = () => {
    if (selected.length === 0) { toast.error("Select mappings to approve"); return; }
    bulkApprove.mutate(selected, {
      onSuccess: (r) => { toast.success(`Approved ${r.approved} mappings`); setSelected([]); },
      onError: () => toast.error("Bulk approve failed"),
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const statusBadge: Record<string, { bg: string; color: string }> = {
    pending: { bg: "rgba(245,158,11,0.1)", color: "#f59e0b" },
    approved: { bg: "rgba(16,185,129,0.1)", color: "#10b981" },
    rejected: { bg: "rgba(239,68,68,0.1)", color: "#ef4444" },
    ai_suggested: { bg: "rgba(139,92,246,0.1)", color: "#8b5cf6" },
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          {t("schoolAdmin.dataMappings.title", "Data Mappings")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {t("schoolAdmin.dataMappings.subtitle", "Map fields between external systems and TimCare. AI can suggest mappings.")}
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
          <Input
            placeholder="Search mappings..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-8 text-xs"
            style={{ borderRadius: 6, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-8 text-xs" style={{ borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="ai_suggested">AI Suggested</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={handleAISuggest}
          disabled={aiSuggest.isPending}
          style={{
            height: 32, borderRadius: 6, padding: "0 12px",
            fontSize: 11, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4,
            background: "transparent", color: "var(--admin-font-primary)",
            border: "1px solid var(--admin-border-default)", cursor: "pointer",
            opacity: aiSuggest.isPending ? 0.6 : 1,
          }}
        >
          {aiSuggest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          AI Suggest
        </button>

        {selected.length > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkApprove.isPending}
            style={{
              height: 32, borderRadius: 6, padding: "0 12px",
              fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 4,
              background: "transparent", color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)", cursor: "pointer",
              opacity: bulkApprove.isPending ? 0.6 : 1,
            }}
          >
            {bulkApprove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Approve ({selected.length})
          </button>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <button style={{
              height: 32, borderRadius: 6, padding: "0 12px",
              fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 4,
              background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
              border: "none", cursor: "pointer", marginLeft: "auto",
            }}>
              <Plus className="h-3.5 w-3.5" />Add Mapping
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Data Mapping</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>External Source</Label>
                  <Select value={form.externalSource} onValueChange={(v) => setForm({ ...form, externalSource: v as ExternalSource })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iSAMS">iSAMS</SelectItem>
                      <SelectItem value="CSV">CSV</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>External Code</Label>
                  <Input value={form.externalCode} onChange={(e) => setForm({ ...form, externalCode: e.target.value })} placeholder="EXT-MATH-101" />
                </div>
              </div>
              <div className="space-y-2">
                <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>External Name (optional)</Label>
                <Input value={form.externalName || ""} onChange={(e) => setForm({ ...form, externalName: e.target.value })} placeholder="Mathematics 101" />
              </div>
              <div className="space-y-2">
                <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Internal Course ID</Label>
                <Input value={form.internalCourseId} onChange={(e) => setForm({ ...form, internalCourseId: e.target.value })} placeholder="Internal course ID" />
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={() => setAddOpen(false)}
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
                onClick={handleCreate}
                disabled={create.isPending}
                style={{
                  height: 36, borderRadius: 6, padding: "0 14px",
                  fontSize: 12, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                  background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
                  border: "none", cursor: "pointer",
                  opacity: create.isPending ? 0.6 : 1,
                }}
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Create
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mappings Table */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--admin-bg-hover)",
        }}>
          <ArrowRightLeft style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #3b82f6)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
            Mappings
          </span>
          {data && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
              background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
              border: "1px solid var(--admin-border-default)",
            }}>
              {data.total}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}></TableHead>
                <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>External</TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}></TableHead>
                <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Internal</TableHead>
                <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Source</TableHead>
                <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Status</TableHead>
                <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Confidence</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((m) => (
                <TableRow key={m.id} style={{ background: selected.includes(m.id) ? "var(--admin-bg-hover)" : undefined }}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      style={{ borderRadius: 3 }}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--admin-font-tertiary)" }}>{m.externalSource}:</span>{" "}
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>{m.externalCode}</span>
                      {m.externalName && <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{m.externalName}</p>}
                    </div>
                  </TableCell>
                  <TableCell><ArrowRightLeft style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)", opacity: 0.4 }} /></TableCell>
                  <TableCell>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>{m.internalCode}</span>
                      <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{m.internalName}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                      background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                    }}>
                      {m.source}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                      background: (statusBadge[m.status] || statusBadge.pending).bg,
                      color: (statusBadge[m.status] || statusBadge.pending).color,
                      textTransform: "capitalize",
                    }}>
                      {m.status.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                    {m.confidence ? `${Math.round(m.confidence * 100)}%` : "\u2014"}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => remove.mutate(m.id, { onSuccess: () => toast.success("Deleted") })}
                      style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <Trash2 style={{ width: 14, height: 14, color: "#ef4444" }} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.data || data.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} style={{ textAlign: "center", color: "var(--admin-font-tertiary)", padding: "48px 0", fontSize: 12 }}>
                    No mappings found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={{
              height: 30, borderRadius: 6, padding: "0 10px",
              fontSize: 11, fontWeight: 600,
              background: "transparent", color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)", cursor: "pointer",
              opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{page} / {data.totalPages}</span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{
              height: 30, borderRadius: 6, padding: "0 10px",
              fontSize: 11, fontWeight: 600,
              background: "transparent", color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)", cursor: "pointer",
              opacity: page >= data.totalPages ? 0.4 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
