"use client";

import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import type { SuperScore } from "@/services/testScoreService";

interface SuperScoreBannerProps {
  superScore: SuperScore | null;
}

export function SuperScoreBanner({ superScore }: SuperScoreBannerProps) {
  if (!superScore?.sat && !superScore?.act) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="dash-card p-5"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
          <Trophy className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-foreground">SuperScore</h3>
          <p className="text-xs text-muted-foreground">
            Best section scores combined across all attempts
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {superScore.sat && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
              SAT SuperScore
            </p>
            <p className="text-3xl font-bold text-blue-800 mb-1">
              {superScore.sat.total}
            </p>
            <p className="text-xs text-blue-600">
              Math {superScore.sat.math} &middot; Reading {superScore.sat.reading}
            </p>
          </div>
        )}
        {superScore.act && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-purple-600 mb-2">
              ACT SuperScore
            </p>
            <p className="text-3xl font-bold text-purple-800 mb-1">
              {superScore.act.composite}
            </p>
            <p className="text-xs text-purple-600">
              Eng {superScore.act.english} &middot; Math {superScore.act.math} &middot; Read{" "}
              {superScore.act.reading} &middot; Sci {superScore.act.science}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
