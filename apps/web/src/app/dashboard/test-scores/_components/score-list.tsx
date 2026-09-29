"use client";

import { motion } from "motion/react";
import { Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TestScore } from "@/services/testScoreService";
import { TYPE_COLOR } from "./score-helpers";
import { ScoreCard } from "./score-card";
import { useTranslation } from "react-i18next";

interface ScoreListProps {
  loading: boolean;
  scores: TestScore[];
  grouped: Record<string, TestScore[]>;
  groupKeys: string[];
  deleting: string | null;
  onEdit: (score: TestScore) => void;
  onDelete: (id: string) => void;
  onAddClick: () => void;
}

export function ScoreList({
  loading,
  scores,
  grouped,
  groupKeys,
  deleting,
  onEdit,
  onDelete,
  onAddClick,
}: ScoreListProps) {
  const { t } = useTranslation("student");
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-6"
    >
      {loading ? (
        <div className="dash-card p-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : scores.length === 0 ? (
        <div className="dash-card p-10 text-center border border-dashed border-border">
          <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center mx-auto mb-3">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">{t("testScores.list.emptyTitle")}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {t("testScores.list.emptyBody")}
          </p>
          <Button
            variant="outline"
            onClick={onAddClick}
            className="mt-4 border border-border text-foreground hover:bg-secondary text-xs"
          >
            {t("testScores.list.addFirst")}
          </Button>
        </div>
      ) : (
        groupKeys.map((type, gi) => {
          const group = grouped[type];
          const colors = TYPE_COLOR[type] ?? TYPE_COLOR["SAT"];
          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + gi * 0.04 }}
              className="dash-card p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.icon}`}>
                  <BookOpen className={`w-4 h-4 ${colors.text}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">
                    {type === "AP" ? t("testScores.list.apExams") : type}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("testScores.list.resultCount", { count: group.length })}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {group.map((score, i) => (
                  <ScoreCard
                    key={score.id}
                    score={score}
                    index={i}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    deleting={deleting}
                  />
                ))}
              </div>
            </motion.div>
          );
        })
      )}
    </motion.div>
  );
}
