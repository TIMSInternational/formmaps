"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  Edit2,
  Trash2,
  Loader2,
  BookOpen,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import type { TestScore } from "@/services/testScoreService";
import { TYPE_COLOR, scoreLabel, scoreSubLabel } from "./score-helpers";

interface ScoreCardProps {
  score: TestScore;
  index: number;
  onEdit: (score: TestScore) => void;
  onDelete: (id: string) => void;
  deleting: string | null;
}

export function ScoreCard({ score, index, onEdit, onDelete, deleting }: ScoreCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const colors = TYPE_COLOR[score.testType] ?? TYPE_COLOR["SAT"];
  const main = scoreLabel(score);
  const sub = scoreSubLabel(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.03 }}
      className="p-4 rounded-xl border border-border hover:border-foreground/20 transition-colors flex flex-col sm:flex-row sm:items-center gap-4"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors.icon}`}>
        <BookOpen className={`w-5 h-5 ${colors.text}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
            {score.testType}
          </span>
          {score.isOfficial && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              Official
            </span>
          )}
          {score.testDate && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
              <Calendar className="h-3 w-3" />
              {format(new Date(score.testDate), "MMM d, yyyy")}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-foreground">{main}</span>
          {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {confirmDelete ? (
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              <span className="text-xs font-semibold text-red-700">Delete?</span>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(score.id);
                }}
                disabled={deleting === score.id}
                className="text-xs font-bold text-red-700 hover:text-red-900 disabled:opacity-50"
              >
                {deleting === score.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
              </button>
              <span className="text-red-300">&middot;</span>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                No
              </button>
            </motion.div>
          </AnimatePresence>
        ) : (
          <>
            <button
              onClick={() => onEdit(score)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
