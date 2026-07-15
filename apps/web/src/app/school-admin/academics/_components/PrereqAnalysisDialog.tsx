"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Network, RefreshCw } from "lucide-react";
import {
  useAnalyzePrerequisites, useApplyPrereqSuggestions,
} from "@/hooks/useCurriculumQueries";
import type { PrereqSuggestion, PrereqApplyUpdate } from "@/types/prereq";

// ── Style constants ────────────────────────────────────────────────────────────
const CENTERED_WRAP: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", padding: "48px 0", gap: 12,
};
const BTN_GHOST: React.CSSProperties = {
  height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 500,
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  color: "var(--admin-font-secondary)", cursor: "pointer",
};
const BTN_SECONDARY: React.CSSProperties = {
  height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
  display: "flex", alignItems: "center", gap: 6,
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  color: "var(--admin-font-secondary)", cursor: "pointer",
};
const BTN_BULK_GHOST: React.CSSProperties = {
  height: 28, borderRadius: 6, padding: "0 10px", fontSize: 11, fontWeight: 500,
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  color: "var(--admin-font-secondary)", cursor: "pointer",
};
const BTN_PRIMARY: React.CSSProperties = {
  height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
  display: "flex", alignItems: "center", gap: 8, border: "none", cursor: "pointer",
};
const CHIP_BASE: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, display: "inline-block",
};
const TH_STYLE: React.CSSProperties = { fontSize: 11, color: "var(--admin-font-tertiary)" };
const TD_REASON: React.CSSProperties = {
  fontSize: 11, color: "var(--admin-font-tertiary)",
  maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

// ── CenteredState ──────────────────────────────────────────────────────────────
function CenteredState({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <div style={CENTERED_WRAP}>{icon}{children}</div>;
}

// ── Confidence chip ────────────────────────────────────────────────────────────
function ConfidenceChip({ level }: { level: PrereqSuggestion["confidence"] }) {
  const map: Record<PrereqSuggestion["confidence"], React.CSSProperties> = {
    high:   { background: "rgba(5,150,105,0.12)", color: "#059669", border: "none" },
    medium: { background: "rgba(217,119,6,0.12)",  color: "#d97706", border: "none" },
    low:    { background: "rgba(107,114,128,0.12)", color: "#6b7280", border: "none" },
  };
  return <span style={{ ...CHIP_BASE, ...map[level] }}>{level}</span>;
}

// ── Source chip ────────────────────────────────────────────────────────────────
function SourceChip({ source }: { source: PrereqSuggestion["source"] }) {
  return source === "pattern"
    ? <span style={{ ...CHIP_BASE, border: "1px solid #2E9098", color: "#2E9098", background: "transparent" }}>Pattern</span>
    : <span style={{ ...CHIP_BASE, background: "#FFD23F", color: "#102B47", border: "none" }}>AI</span>;
}

// ── Main dialog ────────────────────────────────────────────────────────────────
interface PrereqAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrereqAnalysisDialog({ open, onOpenChange }: PrereqAnalysisDialogProps) {
  const analyze = useAnalyzePrerequisites();
  const apply   = useApplyPrereqSuggestions();
  const suggestions: PrereqSuggestion[] = analyze.data ?? [];
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    analyze.reset();
    analyze.mutate(undefined, {
      onSuccess: (data) => {
        const initial = new Set<string>();
        data.forEach((s) => { if (s.confidence === "high") initial.add(rowKey(s)); });
        setChecked(initial);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function rowKey(s: PrereqSuggestion) { return `${s.courseId}|${s.prerequisiteCode}`; }

  function toggleRow(key: string) {
    setChecked((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function selectHighConfidence() {
    setChecked(new Set(suggestions.filter((s) => s.confidence === "high").map(rowKey)));
  }
  function selectAll()  { setChecked(new Set(suggestions.map(rowKey))); }
  function clearAll()   { setChecked(new Set()); }

  function buildUpdates(): PrereqApplyUpdate[] {
    const map = new Map<string, string[]>();
    suggestions.forEach((s) => {
      if (!checked.has(rowKey(s))) return;
      map.set(s.courseId, [...(map.get(s.courseId) ?? []), s.prerequisiteCode]);
    });
    return Array.from(map.entries()).map(([courseId, addPrerequisites]) => ({ courseId, addPrerequisites }));
  }

  const selectedCount = checked.size;

  function handleApply() {
    apply.mutate(buildUpdates(), { onSuccess: () => onOpenChange(false) });
  }

  function handleRunAgain() {
    analyze.reset();
    analyze.mutate(undefined, {
      onSuccess: (data) => {
        const initial = new Set<string>();
        data.forEach((s) => { if (s.confidence === "high") initial.add(rowKey(s)); });
        setChecked(initial);
      },
    });
  }

  // ── Render states ────────────────────────────────────────────────────────────
  function renderBody() {
    if (analyze.isPending) {
      return (
        <CenteredState icon={<Loader2 style={{ width: 28, height: 28, color: "#2E9098", animation: "spin 1s linear infinite" }} />}>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>Analyzing your catalog&hellip;</p>
        </CenteredState>
      );
    }

    if (analyze.isError) {
      return (
        <CenteredState>
          <p style={{ fontSize: 13, color: "#dc2626" }}>Analysis failed. Please try again.</p>
          <button onClick={handleRunAgain} style={BTN_SECONDARY}>
            <RefreshCw style={{ width: 12, height: 12 }} /> Run again
          </button>
        </CenteredState>
      );
    }

    if (analyze.isSuccess && suggestions.length === 0) {
      return (
        <CenteredState icon={<Network style={{ width: 32, height: 32, opacity: 0.25 }} />}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", textAlign: "center" }}>
            No missing prerequisites found — your graph looks complete.
          </p>
          <button onClick={() => onOpenChange(false)} style={{ ...BTN_SECONDARY, fontWeight: 500 }}>Close</button>
        </CenteredState>
      );
    }

    if (!analyze.isSuccess) return null;

    return (
      <div className="space-y-3">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={selectHighConfidence} style={{ ...BTN_BULK_GHOST, background: "rgba(5,150,105,0.1)", border: "1px solid #059669", color: "#059669" }}>
            Select high confidence
          </button>
          <button onClick={selectAll}  style={BTN_BULK_GHOST}>Select all</button>
          <button onClick={clearAll}   style={BTN_BULK_GHOST}>Clear</button>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--admin-font-tertiary)" }}>
            {selectedCount} of {suggestions.length} selected
          </span>
        </div>

        <div style={{ maxHeight: 440, overflowY: "auto", borderRadius: 6, border: "1px solid var(--admin-border-default)" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: "var(--admin-bg-hover)" }}>
                <TableHead style={{ ...TH_STYLE, width: 36 }} />
                <TableHead style={TH_STYLE}>Course (needs)</TableHead>
                <TableHead style={TH_STYLE}>Prerequisite</TableHead>
                <TableHead style={TH_STYLE}>Confidence</TableHead>
                <TableHead style={TH_STYLE}>Source</TableHead>
                <TableHead style={TH_STYLE}>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((s) => {
                const key = rowKey(s);
                return (
                  <TableRow key={key} style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                    <TableCell className="py-2 px-3">
                      <input type="checkbox" checked={checked.has(key)} onChange={() => toggleRow(key)}
                        aria-label={`Toggle ${s.courseCode} needs ${s.prerequisiteCode}`}
                        style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#102B47" }} />
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.courseCode}</span>
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--admin-font-light)" }}>{s.prerequisiteCode}</span>
                    </TableCell>
                    <TableCell className="py-2 px-3"><ConfidenceChip level={s.confidence} /></TableCell>
                    <TableCell className="py-2 px-3"><SourceChip source={s.source} /></TableCell>
                    <TableCell className="py-2 px-3" style={TD_REASON} title={s.reason}>{s.reason}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  const showFooter = analyze.isSuccess && suggestions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", width: "90vw" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: "var(--admin-font-primary)" }}>
            <Network style={{ width: 18, height: 18, color: "#2E9098" }} />
            Analyze Prerequisites
          </DialogTitle>
        </DialogHeader>

        {renderBody()}

        {showFooter && (
          <DialogFooter className="gap-2">
            <button onClick={() => onOpenChange(false)} style={BTN_GHOST}>Cancel</button>
            <button onClick={handleApply} disabled={selectedCount === 0 || apply.isPending}
              style={{
                ...BTN_PRIMARY,
                background: selectedCount === 0 ? "var(--admin-bg-hover)" : "#2E9098",
                color: selectedCount === 0 ? "var(--admin-font-tertiary)" : "#fff",
                border: selectedCount === 0 ? "1px solid var(--admin-border-default)" : "none",
                cursor: selectedCount === 0 || apply.isPending ? "not-allowed" : "pointer",
                opacity: apply.isPending ? 0.7 : 1,
              }}>
              {apply.isPending && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
              Apply {selectedCount} selected
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
