"use client";

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
  return (
    <div className="bg-secondary/30 overflow-y-auto flex flex-col">
      {/* Preview toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {fullName || "Resume"}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-[#FFD600] text-[#111111]">
            {template}
          </span>
        </div>
        <button
          onClick={() => onPopulateSampleData(careerField || "technology")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-[#065292] hover:bg-[#065292]/10 hover:border-[#065292]/40 rounded-lg border border-border transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Sample Data
        </button>
      </div>
      {/* PDF Preview */}
      <div className="flex-1 overflow-y-auto p-3">
        <ResumePreviewWithToggle
          hasOriginal={hasOriginal}
          loadOriginalUrl={() => getOriginalUrl(resumeId)}
          edited={<LivePreviewPDF />}
        />
      </div>
    </div>
  );
}
