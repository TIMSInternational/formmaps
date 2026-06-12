"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Network, RefreshCw } from "lucide-react";
import {
  useAnalyzePrerequisites,
  useApplyPrereqSuggestions,
} from "@/hooks/useCurriculumQueries";
import type { PrereqSuggestion, PrereqApplyUpdate } from "@/types/prereq";

interface PrereqAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Confidence chip ────────────────────────────────────────────────────────────
function ConfidenceChip({ level }: { level: PrereqSuggestion["confidence"] }) {
  const styles: Record<PrereqSuggestion["confidence"], React.CSSProperties> = {
    high: { background: "rgba(5,150,105,0.12)", color: "#059669", border: "none" },
    medium: { background: "rgba(217,119,6,0.12)", color: "#d97706", border: "none" },
    low: { background: "rgba(107,114,128,0.12)", color: "#6b7280", border: "none" },
  };
  return (
    <span
      style={{
        ...styles[level],
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 99,
        display: "inline-block",
      }}
    >
      {level}
    </span>
  );
}

// ── Source chip ────────────────────────────────────────────────────────────────
function SourceChip({ source }: { source: PrereqSuggestion["source"] }) {
  if (source === "pattern") {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: "2px 7px",
          borderRadius: 99,
          border: "1px solid #065292",
          color: "#065292",
          background: "transparent",
          display: "inline-block",
        }}
      >
        Pattern
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 99,
        background: "#FFD600",
        color: "#111111",
        border: "none",
        display: "inline-block",
      }}
    >
      AI
    </span>
  );
}

// ── Main dialog ────────────────────────────────────────────────────────────────
export function PrereqAnalysisDialog({
  open,
  onOpenChange,
}: PrereqAnalysisDialogProps) {
  const analyze = useAnalyzePrerequisites();
  const apply = useApplyPrereqSuggestions();

  const suggestions: PrereqSuggestion[] = analyze.data ?? [];
  // checked set keyed by "courseId|prerequisiteCode"
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Run analysis automatically when dialog opens
  useEffect(() => {
    if (!open) return;
    analyze.mutate(undefined, {
      onSuccess: (data) => {
        // Pre-check all high-confidence suggestions
        const initial = new Set<string>();
        data.forEach((s) => {
          if (s.confidence === "high") initial.add(`${s.courseId}|${s.prerequisiteCode}`);
        });
        setChecked(initial);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function rowKey(s: PrereqSuggestion) {
    return `${s.courseId}|${s.prerequisiteCode}`;
  }

  function toggleRow(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectHighConfidence() {
    const next = new Set<string>();
    suggestions.forEach((s) => {
      if (s.confidence === "high") next.add(rowKey(s));
    });
    setChecked(next);
  }

  function selectAll() {
    setChecked(new Set(suggestions.map(rowKey)));
  }

  function clearAll() {
    setChecked(new Set());
  }

  function buildUpdates(): PrereqApplyUpdate[] {
    const map = new Map<string, string[]>();
    suggestions.forEach((s) => {
      if (!checked.has(rowKey(s))) return;
      const existing = map.get(s.courseId) ?? [];
      existing.push(s.prerequisiteCode);
      map.set(s.courseId, existing);
    });
    return Array.from(map.entries()).map(([courseId, addPrerequisites]) => ({
      courseId,
      addPrerequisites,
    }));
  }

  const selectedCount = checked.size;

  function handleApply() {
    const updates = buildUpdates();
    apply.mutate(updates, { onSuccess: () => onOpenChange(false) });
  }

  function handleRunAgain() {
    analyze.reset();
    analyze.mutate(undefined, {
      onSuccess: (data) => {
        const initial = new Set<string>();
        data.forEach((s) => {
          if (s.confidence === "high") initial.add(rowKey(s));
        });
        setChecked(initial);
      },
    });
  }

  // ── Render states ────────────────────────────────────────────────────────────
  function renderBody() {
    if (analyze.isPending) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 0",
            gap: 12,
          }}
        >
          <Loader2
            style={{
              width: 28,
              height: 28,
              color: "#065292",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
            Analyzing your catalog&hellip;
          </p>
        </div>
      );
    }

    if (analyze.isError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 0",
            gap: 12,
          }}
        >
          <p style={{ fontSize: 13, color: "#dc2626" }}>
            Analysis failed. Please try again.
          </p>
          <button
            onClick={handleRunAgain}
            style={{
              height: 32,
              borderRadius: 6,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--admin-bg-hover)",
              border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)",
              cursor: "pointer",
            }}
          >
            <RefreshCw style={{ width: 12, height: 12 }} />
            Run again
          </button>
        </div>
      );
    }

    if (analyze.isSuccess && suggestions.length === 0) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 0",
            gap: 12,
            textAlign: "center",
          }}
        >
          <Network style={{ width: 32, height: 32, opacity: 0.25 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
            No missing prerequisites found — your graph looks complete.
          </p>
          <button
            onClick={() => onOpenChange(false)}
            style={{
              height: 32,
              borderRadius: 6,
              padding: "0 16px",
              fontSize: 12,
              fontWeight: 500,
              background: "var(--admin-bg-hover)",
              border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      );
    }

    if (!analyze.isSuccess) return null;

    return (
      <div className="space-y-3">
        {/* Bulk action row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={selectHighConfidence}
            style={{
              height: 28,
              borderRadius: 6,
              padding: "0 10px",
              fontSize: 11,
              fontWeight: 500,
              background: "rgba(5,150,105,0.1)",
              border: "1px solid #059669",
              color: "#059669",
              cursor: "pointer",
            }}
          >
            Select high confidence
          </button>
          <button
            onClick={selectAll}
            style={{
              height: 28,
              borderRadius: 6,
              padding: "0 10px",
              fontSize: 11,
              fontWeight: 500,
              background: "var(--admin-bg-hover)",
              border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)",
              cursor: "pointer",
            }}
          >
            Select all
          </button>
          <button
            onClick={clearAll}
            style={{
              height: 28,
              borderRadius: 6,
              padding: "0 10px",
              fontSize: 11,
              fontWeight: 500,
              background: "var(--admin-bg-hover)",
              border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--admin-font-tertiary)" }}>
            {selectedCount} of {suggestions.length} selected
          </span>
        </div>

        {/* Suggestions table */}
        <div
          style={{
            maxHeight: 440,
            overflowY: "auto",
            borderRadius: 6,
            border: "1px solid var(--admin-border-default)",
          }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ background: "var(--admin-bg-hover)" }}>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", width: 36 }} />
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Course (needs)</TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Prerequisite</TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Confidence</TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Source</TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((s) => {
                const key = rowKey(s);
                const isChecked = checked.has(key);
                return (
                  <TableRow
                    key={key}
                    style={{ borderBottom: "1px solid var(--admin-border-default)" }}
                  >
                    <TableCell className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(key)}
                        aria-label={`Toggle ${s.courseCode} needs ${s.prerequisiteCode}`}
                        style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#065292" }}
                      />
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--admin-font-primary)",
                        }}
                      >
                        {s.courseCode}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          color: "var(--admin-font-light)",
                        }}
                      >
                        {s.prerequisiteCode}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <ConfidenceChip level={s.confidence} />
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <SourceChip source={s.source} />
                    </TableCell>
                    <TableCell
                      className="py-2 px-3"
                      style={{
                        fontSize: 11,
                        color: "var(--admin-font-tertiary)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={s.reason}
                    >
                      {s.reason}
                    </TableCell>
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
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--admin-bg-card)",
          border: "1px solid var(--admin-border-default)",
          width: "90vw",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            style={{ color: "var(--admin-font-primary)" }}
          >
            <Network style={{ width: 18, height: 18, color: "#065292" }} />
            Analyze Prerequisites
          </DialogTitle>
        </DialogHeader>

        {renderBody()}

        {showFooter && (
          <DialogFooter className="gap-2">
            <button
              onClick={() => onOpenChange(false)}
              style={{
                height: 36,
                borderRadius: 6,
                padding: "0 16px",
                fontSize: 13,
                fontWeight: 500,
                background: "var(--admin-bg-hover)",
                border: "1px solid var(--admin-border-default)",
                color: "var(--admin-font-secondary)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={selectedCount === 0 || apply.isPending}
              style={{
                height: 36,
                borderRadius: 6,
                padding: "0 20px",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: selectedCount === 0 ? "var(--admin-bg-hover)" : "#065292",
                color: selectedCount === 0 ? "var(--admin-font-tertiary)" : "#fff",
                border: selectedCount === 0 ? "1px solid var(--admin-border-default)" : "none",
                cursor: selectedCount === 0 || apply.isPending ? "not-allowed" : "pointer",
                opacity: apply.isPending ? 0.7 : 1,
              }}
            >
              {apply.isPending && (
                <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              )}
              Apply {selectedCount} selected
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
