"use client";

import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SuperScore } from "@/services/testScoreService";

interface SuperScoreBannerProps {
  superScore: SuperScore | null;
}

export function SuperScoreBanner({ superScore }: SuperScoreBannerProps) {
  const { t } = useTranslation();
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
          <h3 className="font-semibold text-sm text-foreground">{t("studentUi.testScores.superScore.title")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("studentUi.testScores.superScore.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {superScore.sat && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
              {t("studentUi.testScores.superScore.sat")}
            </p>
            <p className="text-3xl font-bold text-blue-800 mb-1">
              {superScore.sat.total}
            </p>
            <p className="text-xs text-blue-600">
              {t("studentUi.testScores.sub.sat", { math: superScore.sat.math, reading: superScore.sat.reading })}
            </p>
          </div>
        )}
        {superScore.act && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-purple-600 mb-2">
              {t("studentUi.testScores.superScore.act")}
            </p>
            <p className="text-3xl font-bold text-purple-800 mb-1">
              {superScore.act.composite}
            </p>
            <p className="text-xs text-purple-600">
              {t("studentUi.testScores.sub.act", {
                english: superScore.act.english,
                math: superScore.act.math,
                reading: superScore.act.reading,
                science: superScore.act.science,
              })}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
