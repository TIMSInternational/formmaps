"use client";

import { useCallback } from "react";
import { Sparkles } from "lucide-react";
import { LivePreviewPDF } from "./LivePreviewPDF";
import { ResumePreviewWithToggle } from "./ResumePreviewWithToggle";
import { getOriginalUrl } from "@/services/resumeService";

interface ResumePreviewPanelProps {
  fullName: string;
  template: string;
  careerField: string;
  onPopulateSampleData: (careerField: string) => void;
  resumeId: string;
  hasOriginal: boolean;
}

export function ResumePreviewPanel({
  fullName,
  template,
  careerField,
  onPopulateSampleData,
  resumeId,
  hasOriginal,
}: ResumePreviewPanelProps) {
  // Stable reference so the toggle doesn't re-fetch the original on each render.
  const loadOriginal = useCallback(() => getOriginalUrl(resumeId), [resumeId]);
  return (
    <div className="bg-secondary/30 overflow-y-auto flex flex-col">
      {/* Preview toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {fullName || "Resume"}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-[#FFD23F] text-[#102B47]">
            {template}
          </span>
        </div>
        <button
          onClick={() => onPopulateSampleData(careerField || "technology")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-[#2E9098] hover:bg-[#102B47]/10 hover:border-[#2E9098]/40 rounded-lg border border-border transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Sample Data
        </button>
      </div>
      {/* PDF Preview — Original (uploaded PDF) vs Preview (live, AI-editable) */}
      <div className="flex-1 overflow-y-auto p-3">
        <ResumePreviewWithToggle
          hasOriginal={hasOriginal}
          loadOriginalUrl={loadOriginal}
          edited={<LivePreviewPDF />}
        />
      </div>
    </div>
  );
}
