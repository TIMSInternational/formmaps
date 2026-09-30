"use client";

import { motion } from "motion/react";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CollegeFitResult, CollegeFit } from "@/services/testScoreService";

interface CollegeFitCardProps {
  result: CollegeFitResult;
}

const FIT_STYLE: Record<
  CollegeFit["fit"],
  { label: string; bg: string; text: string; border: string }
> = {
  reach:  { label: "studentUi.testScores.collegeFit.reach", bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200"    },
  match:  { label: "studentUi.testScores.collegeFit.match", bg: "bg-blue-50",   text: "text-blue-700",  border: "border-blue-200"   },
  safety: { label: "studentUi.testScores.collegeFit.safety", bg: "bg-green-50",  text: "text-green-700", border: "border-green-200"  },
};

export function CollegeFitCard({ result }: CollegeFitCardProps) {
  const { t } = useTranslation();
  if (!result.superscore || result.colleges.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="dash-card p-5"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[var(--admin-accent-blue)]/10 flex items-center justify-center">
          <GraduationCap className="w-4 h-4 text-[var(--admin-accent-blue)]" />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-foreground">{t("studentUi.testScores.collegeFit.title")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("studentUi.testScores.collegeFit.basedOn")}{" "}
            <span className="font-semibold text-foreground">{result.superscore}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {result.colleges.map((college) => {
          const style = FIT_STYLE[college.fit];
          return (
            <div
              key={college.id}
              className={`flex items-center justify-between rounded-xl border ${style.border} ${style.bg} px-4 py-3`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {college.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {college.city}, {college.state}
                  {" · "}SAT {college.sat25}–{college.sat75}
                  {" · "}
                  {college.acceptanceRate != null
                    ? t("studentUi.testScores.collegeFit.admitRate", { rate: (college.acceptanceRate * 100).toFixed(0) })
                    : t("studentUi.testScores.collegeFit.admitRateNA")}
                </p>
              </div>
              <span
                className={`ml-4 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text} border ${style.border}`}
              >
                {t(style.label)}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
