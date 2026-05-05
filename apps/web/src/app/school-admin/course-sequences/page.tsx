"use client";

import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Network, Plus, Loader2, Trash2, PenSquare, Sparkles, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useCourseSequences, useCreateCourseSequence, useDeleteCourseSequence, useGenerateCourseSequenceAI } from "@/hooks/useCourseSequenceQueries";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { Skeleton } from "@/components/ui/skeleton";

const inputStyle: React.CSSProperties = {
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  borderRadius: 6, color: "var(--admin-font-primary)", height: 36, fontSize: 13,
};

export default function CourseSequencesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiFile, setAiFile] = useState<File | null>(null);

  const { data, isLoading } = useCourseSequences({ page, limit: 20, search: search || undefined });
  const create = useCreateCourseSequence();
  const remove = useDeleteCourseSequence();
  const generateAI = useGenerateCourseSequenceAI();

  const sequences = data?.data || [];

  const handleCreate = () => {
    if (!name) { toast.error("Name required"); return; }
    setAddOpen(false);
    router.push(`/school-admin/course-sequences/new/builder?name=${encodeURIComponent(name)}&desc=${encodeURIComponent(description)}`);
    setName(""); setDescription("");
  };

  const handleGenerateAI = () => {
    if (!aiPrompt && !aiFile) { toast.error("Provide instructions or upload a file"); return; }
    generateAI.mutate({ file: aiFile || undefined, prompt: aiPrompt || undefined }, {
      onSuccess: (gen: any) => { toast.success("AI Blueprint Generated!"); setAiOpen(false); localStorage.setItem("ai_sequence_blueprint", JSON.stringify(gen)); router.push("/school-admin/course-sequences/new/builder?source=ai"); },
      onError: (e: any) => toast.error(e?.message || "AI generation failed"),
    });
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} /><Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>Course Sequences</h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>Build multi-year course pathways and assign them to students</p>
        </div>
        <div className="flex items-center gap-2">
          {/* AI Generate */}
          <Dialog open={aiOpen} onOpenChange={setAiOpen}>
            <DialogTrigger asChild>
              <button style={{ height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "rgba(139,92,246,0.1)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.2)", cursor: "pointer" }}>
                <Sparkles style={{ width: 14, height: 14 }} /> AI Generate
              </button>
            </DialogTrigger>
            <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
              <DialogHeader>
                <DialogTitle style={{ color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 8 }}><Sparkles style={{ width: 18, height: 18, color: "#8b5cf6" }} /> Generate Sequence Blueprint</DialogTitle>
                <DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>Upload a syllabus or provide instructions for AI to build a sequence</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Instructions</Label>
                  <Textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g. Build an advanced STEM pathway for grade 11-12..." style={{ ...inputStyle, height: "auto", minHeight: 80 }} />
                </div>
                <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Syllabus Upload (optional)</Label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => fileInputRef.current?.click()} style={{ ...inputStyle, padding: "0 12px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Upload style={{ width: 14, height: 14 }} /> Choose File</button>
                    <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{aiFile ? aiFile.name : "No file"}</span>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setAiFile(e.target.files?.[0] || null)} accept=".csv,.txt,.json" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAiOpen(false); setAiPrompt(""); setAiFile(null); }} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>Cancel</Button>
                <button onClick={handleGenerateAI} disabled={generateAI.isPending} style={{ height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600, background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer" }}>
                  {generateAI.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
                  <span style={{ marginLeft: 6 }}>Generate</span>
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button style={{ height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "#10b981", color: "#fff", border: "none", cursor: "pointer" }}>
                <Plus style={{ width: 14, height: 14 }} /> New Sequence
              </button>
            </DialogTrigger>
            <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
              <DialogHeader><DialogTitle style={{ color: "var(--admin-font-primary)" }}>Create Course Sequence</DialogTitle><DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>Define a multi-year course pathway</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Name</Label><Input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="STEM Track" /></div>
                <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Description</Label><Textarea style={{ ...inputStyle, height: "auto", minHeight: 60 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Course sequence for STEM students" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>Cancel</Button>
                <button onClick={handleCreate} disabled={create.isPending} style={{ height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600, background: "#10b981", color: "#fff", border: "none", cursor: "pointer" }}>
                  {create.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : "Create"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AdminStatCard label="Sequences" value={String(sequences.length)} icon={Network} sub="course pathways" trend={0} />
        <AdminStatCard label="Page" value={`${page}`} icon={Network} sub={`of ${data?.totalPages || 1}`} trend={0} />
        <AdminStatCard label="Total" value={String(data?.total || sequences.length)} icon={Network} sub="across all pages" trend={0} />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Input placeholder="Search sequences..." className="h-9 rounded-lg text-sm" style={inputStyle}
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sequences.map((seq: any) => (
          <div key={seq.id} style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
            padding: 16, transition: "all 0.15s", cursor: "pointer",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-hover, #3a3a3a)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default, #2a2a2a)"; }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(20,184,166,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Network style={{ width: 16, height: 16, color: "#14b8a6" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{seq.name}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); remove.mutate(seq.id, { onSuccess: () => toast.success("Deleted") }); }}
                style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-light)", cursor: "pointer" }}>
                <Trash2 style={{ width: 12, height: 12 }} />
              </button>
            </div>

            {seq.description && <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 10, lineHeight: 1.4 }}>{seq.description}</div>}

            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 12 }}>
              {seq.nodeCount !== undefined && <span>{seq.nodeCount} courses</span>}
              {seq.gradeRange && <span>· Grades {seq.gradeRange}</span>}
            </div>

            <button onClick={() => router.push(`/school-admin/course-sequences/${seq.id}/builder`)}
              style={{
                width: "100%", height: 32, borderRadius: 6, fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "rgba(20,184,166,0.08)", color: "#14b8a6",
                border: "1px solid rgba(20,184,166,0.2)", cursor: "pointer", transition: "all 0.15s",
              }}>
              <PenSquare style={{ width: 12, height: 12 }} /> Open Builder
            </button>
          </div>
        ))}

        {sequences.length === 0 && (
          <div className="col-span-full" style={{ padding: 48, textAlign: "center", color: "var(--admin-font-tertiary)", borderRadius: 8, border: "1px dashed var(--admin-border-default)" }}>
            <Network style={{ width: 32, height: 32, margin: "0 auto 12px", opacity: 0.3 }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)", marginBottom: 4 }}>No sequences yet</div>
            <div style={{ fontSize: 12 }}>Create one to start building course pathways</div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>Previous</Button>
          <span className="self-center text-xs" style={{ color: "var(--admin-font-tertiary)" }}>{page} / {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}
            style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>Next</Button>
        </div>
      )}
    </div>
  );
}
