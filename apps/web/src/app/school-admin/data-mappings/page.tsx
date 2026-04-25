"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    ai_suggested: "bg-purple-100 text-purple-700",
  };

  if (isLoading) {
    return (<div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-[500px] w-full" /></div>);
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.dataMappings.title", "Data Mappings")}
        </h1>
        <p className="text-lg text-gray-500 font-medium">
          {t("schoolAdmin.dataMappings.subtitle", "Map fields between external systems and TimCare. AI can suggest mappings.")}
        </p>
      </motion.div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search mappings..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="ai_suggested">AI Suggested</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={handleAISuggest} disabled={aiSuggest.isPending}>
          {aiSuggest.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          AI Suggest
        </Button>

        {selected.length > 0 && (
          <Button variant="outline" onClick={handleBulkApprove} disabled={bulkApprove.isPending}>
            {bulkApprove.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-1" />}
            Approve ({selected.length})
          </Button>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white ml-auto"><Plus className="h-4 w-4 mr-1" />Add Mapping</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Data Mapping</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>External Source</Label>
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
                <div className="space-y-2"><Label>External Code</Label><Input value={form.externalCode} onChange={(e) => setForm({ ...form, externalCode: e.target.value })} placeholder="EXT-MATH-101" /></div>
              </div>
              <div className="space-y-2"><Label>External Name (optional)</Label><Input value={form.externalName || ""} onChange={(e) => setForm({ ...form, externalName: e.target.value })} placeholder="Mathematics 101" /></div>
              <div className="space-y-2"><Label>Internal Course ID</Label><Input value={form.internalCourseId} onChange={(e) => setForm({ ...form, internalCourseId: e.target.value })} placeholder="Internal course ID" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={create.isPending} className="bg-teal-600 text-white">
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Mappings Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100">
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-teal-600" />
              Mappings {data && <Badge variant="secondary">{data.total}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>External</TableHead>
                  <TableHead></TableHead>
                  <TableHead>Internal</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data?.map((m) => (
                  <TableRow key={m.id} className={selected.includes(m.id) ? "bg-teal-50" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.includes(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm"><span className="font-mono text-xs text-gray-500">{m.externalSource}:</span> <span className="font-medium">{m.externalCode}</span>{m.externalName && <p className="text-xs text-gray-400">{m.externalName}</p>}</div>
                    </TableCell>
                    <TableCell><ArrowRightLeft className="h-4 w-4 text-gray-300" /></TableCell>
                    <TableCell>
                      <div className="text-sm"><span className="font-medium">{m.internalCode}</span><p className="text-xs text-gray-400">{m.internalName}</p></div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{m.source}</Badge></TableCell>
                    <TableCell>
                      <Badge className={statusColors[m.status] || "bg-gray-100 text-gray-700"}>{m.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      {m.confidence ? <span className="text-sm font-medium">{Math.round(m.confidence * 100)}%</span> : "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(m.id, { onSuccess: () => toast.success("Deleted") })}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.data || data.data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-400 py-12">No mappings found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-gray-500 self-center">{page} / {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
