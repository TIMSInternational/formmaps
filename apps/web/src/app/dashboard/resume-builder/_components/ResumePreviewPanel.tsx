"use client";

import { Sparkles } from "lucide-react";
import { LivePreviewPDF } from "./LivePreviewPDF";

interface ResumePreviewPanelProps {
  fullName: string;
  template: string;
  careerField: string;
  onPopulateSampleData: (careerField: string) => void;
}

export function ResumePreviewPanel({
  fullName,
  template,
  careerField,
  onPopulateSampleData,
}: ResumePreviewPanelProps) {
  return (
    <div className="bg-secondary/30 overflow-y-auto flex flex-col">
      {/* Preview toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {fullName || "Resume"}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-border text-muted-foreground">
            {template}
          </span>
        </div>
        <button
          onClick={() => onPopulateSampleData(careerField || "technology")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-border transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Sample Data
        </button>
      </div>
      {/* PDF Preview */}
      <div className="flex-1 overflow-y-auto">
        <LivePreviewPDF />
      </div>
    </div>
  );
}
