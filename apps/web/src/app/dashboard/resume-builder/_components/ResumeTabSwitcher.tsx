"use client";

import { cn } from "@/lib/utils";

export type EditorTab = "rewrite" | "editor" | "style";

interface ResumeTabSwitcherProps {
  activeTab: EditorTab;
  setActiveTab: (tab: EditorTab) => void;
}

export function ResumeTabSwitcher({ activeTab, setActiveTab }: ResumeTabSwitcherProps) {
  return (
    <div className="flex border-b border-gray-200 dark:border-border shrink-0 bg-gray-50/50 dark:bg-secondary/30">
      {(["rewrite", "editor", "style"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            "flex-1 py-2.5 text-xs font-medium transition-colors text-center",
            activeTab === tab
              ? "text-gray-900 dark:text-foreground border-b-2 border-gray-900 dark:border-foreground bg-white dark:bg-card"
              : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground"
          )}
        >
          {tab === "rewrite" ? "AI Rewrite" : tab === "editor" ? "Editor" : "Style"}
        </button>
      ))}
    </div>
  );
}
