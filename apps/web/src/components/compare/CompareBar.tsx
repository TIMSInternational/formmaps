"use client";

import { motion, AnimatePresence } from "motion/react";
import { X, GitCompareArrows } from "lucide-react";
import { useCompare } from "./CompareContext";
import { useSidePanel } from "@/components/side-panel/SidePanel";
import { ComparePanel } from "./ComparePanel";
import type { University, UniversityRecommendation } from "@/types/university";

interface CompareBarProps {
  getUniversity: (id: string) => University | undefined;
  getRecommendation?: (id: string) => UniversityRecommendation | undefined;
}

export function CompareBar({ getUniversity, getRecommendation }: CompareBarProps) {
  const { compareIds, removeFromCompare, clearCompare } = useCompare();
  const { openPanel } = useSidePanel();

  if (compareIds.length === 0) return null;

  const handleCompare = () => {
    const universities = compareIds
      .map((id) => {
        const uni = getUniversity(id);
        const rec = getRecommendation?.(id);
        return uni ? { university: uni, matchScore: rec?.matchScore, matchBreakdown: rec?.matchBreakdown } : null;
      })
      .filter(Boolean) as { university: University; matchScore?: number; matchBreakdown?: any }[];

    openPanel({
      title: `Comparing ${universities.length} Universities`,
      content: <ComparePanel items={universities} />,
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{
          background: "var(--admin-bg-card, #1e1e1e)",
          border: "1px solid var(--admin-border-default, #2a2a2a)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* University chips */}
        <div className="flex items-center gap-2">
          {compareIds.map((id) => {
            const uni = getUniversity(id);
            return (
              <div
                key={id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{
                  background: "var(--admin-bg-hover)",
                  color: "var(--admin-font-primary)",
                  border: "1px solid var(--admin-border-light)",
                }}
              >
                <span className="max-w-[100px] truncate">{uni?.shortName || uni?.name || id}</span>
                <button
                  onClick={() => removeFromCompare(id)}
                  className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
                >
                  <X className="h-3 w-3" style={{ color: "var(--admin-font-tertiary)" }} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Compare button */}
        <button
          onClick={handleCompare}
          disabled={compareIds.length < 2}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
          style={{
            background: compareIds.length >= 2 ? "var(--admin-accent-blue)" : "var(--admin-bg-hover)",
            color: compareIds.length >= 2 ? "#fff" : "var(--admin-font-tertiary)",
          }}
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
          Compare ({compareIds.length})
        </button>

        {/* Clear */}
        <button
          onClick={clearCompare}
          className="text-[11px] px-1.5 py-1 rounded transition-colors"
          style={{ color: "var(--admin-font-tertiary)" }}
        >
          Clear
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
