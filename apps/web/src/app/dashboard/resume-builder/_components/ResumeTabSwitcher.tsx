"use client";

import { cn } from "@/lib/utils";

export type EditorTab = "chat" | "style";

interface ResumeTabSwitcherProps {
  activeTab: EditorTab;
  setActiveTab: (tab: EditorTab) => void;
}

export function ResumeTabSwitcher({ activeTab, setActiveTab }: ResumeTabSwitcherProps) {
  return (
    <div className="flex border-b border-border shrink-0 bg-secondary/30">
      {(["chat", "style"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            "flex-1 py-2.5 text-xs font-medium transition-colors text-center",
            activeTab === tab
              ? "text-[#065292] font-semibold border-b-2 border-[#065292] bg-white dark:bg-card"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab === "chat" ? "AI Editor" : "Style"}
        </button>
      ))}
    </div>
  );
}
