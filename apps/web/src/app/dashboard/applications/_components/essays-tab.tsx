"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { Essay, ESSAY_STATUS_CONFIG, wordCount } from "./types";
import { FormInput, LoadingRow, EmptyState } from "./shared";

interface EssaysTabProps {
  essays: Essay[];
  loadingEssays: boolean;
  expandedEssay: string | null;
  essayDrafts: Record<string, string>;
  savingEssay: string | null;
  reviewingEssay: string | null;
  aiReviews: Record<string, string>;
  showAddEssay: boolean;
  newEssay: { title: string; prompt: string; wordLimit: string; dueDate: string };
  onSetExpandedEssay: (id: string | null) => void;
  onSetEssayDraft: (id: string, value: string) => void;
  onSaveEssayDraft: (id: string) => void;
  onRequestAiReview: (id: string) => void;
  onSetShowAddEssay: (show: boolean) => void;
  onSetNewEssay: (updater: (prev: { title: string; prompt: string; wordLimit: string; dueDate: string }) => { title: string; prompt: string; wordLimit: string; dueDate: string }) => void;
  onAddEssay: () => void;
}

export function EssaysTab({
  essays,
  loadingEssays,
  expandedEssay,
  essayDrafts,
  savingEssay,
  reviewingEssay,
  aiReviews,
  showAddEssay,
  newEssay,
  onSetExpandedEssay,
  onSetEssayDraft,
  onSaveEssayDraft,
  onRequestAiReview,
  onSetShowAddEssay,
  onSetNewEssay,
  onAddEssay,
}: EssaysTabProps) {
  return (
    <motion.div
      key="essays"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="space-y-3"
    >
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--admin-font-secondary)" }}>
          {essays.length} essay{essays.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => onSetShowAddEssay(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ background: "var(--admin-accent-blue)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Essay
        </button>
      </div>

      {/* Add essay form */}
      <AnimatePresence>
        {showAddEssay && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: "var(--admin-bg-card)", border: "1px dashed var(--admin-border-default)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: "var(--admin-font-primary)" }}>
                  New Essay
                </span>
                <button onClick={() => onSetShowAddEssay(false)}>
                  <X className="h-4 w-4" style={{ color: "var(--admin-font-tertiary)" }} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormInput
                  placeholder="Essay title *"
                  value={newEssay.title}
                  onChange={(v) => onSetNewEssay((p) => ({ ...p, title: v }))}
                />
                <FormInput
                  placeholder="Prompt (optional)"
                  value={newEssay.prompt}
                  onChange={(v) => onSetNewEssay((p) => ({ ...p, prompt: v }))}
                />
                <FormInput
                  placeholder="Word limit"
                  type="number"
                  value={newEssay.wordLimit}
                  onChange={(v) => onSetNewEssay((p) => ({ ...p, wordLimit: v }))}
                />
                <FormInput
                  placeholder="Due date"
                  type="date"
                  value={newEssay.dueDate}
                  onChange={(v) => onSetNewEssay((p) => ({ ...p, dueDate: v }))}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onAddEssay}
                  disabled={!newEssay.title.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                  style={{ background: "var(--admin-accent-blue)" }}
                >
                  Add
                </button>
                <button
                  onClick={() => onSetShowAddEssay(false)}
                  className="px-4 py-1.5 rounded-lg text-xs"
                  style={{ color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-default)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Essay list */}
      {loadingEssays ? (
        <LoadingRow />
      ) : essays.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-8 w-8" />} message="No essays yet. Add your first essay to get started." />
      ) : (
        <div className="space-y-2">
          {essays.map((essay) => {
            const statusCfg = ESSAY_STATUS_CONFIG[essay.status];
            const isExpanded = expandedEssay === essay.id;
            const draft = essayDrafts[essay.id] ?? essay.draft ?? "";
            const wc = wordCount(draft);
            const review = aiReviews[essay.id];

            return (
              <motion.div
                key={essay.id}
                layout
                className="rounded-xl overflow-hidden"
                style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
              >
                {/* Essay header */}
                <button
                  onClick={() => onSetExpandedEssay(isExpanded ? null : essay.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="h-4 w-4 shrink-0" style={{ color: "var(--admin-font-tertiary)" }} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>
                        {essay.title}
                      </div>
                      {essay.dueDate && (
                        <div className="flex items-center gap-1 text-[11px] mt-0.5" style={{ color: "var(--admin-font-tertiary)" }}>
                          <Calendar className="h-3 w-3" />
                          Due {essay.dueDate}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: statusCfg.bg, color: statusCfg.color }}
                    >
                      {statusCfg.label}
                    </span>
                    {essay.wordLimit && (
                      <span className="text-[10px]" style={{ color: "var(--admin-font-tertiary)" }}>
                        {wc}/{essay.wordLimit}w
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-4 pb-4 space-y-3"
                        style={{ borderTop: "1px solid var(--admin-border-light)" }}
                      >
                        {essay.prompt && (
                          <div className="pt-3">
                            <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--admin-font-tertiary)" }}>
                              PROMPT
                            </p>
                            <p className="text-xs" style={{ color: "var(--admin-font-secondary)" }}>
                              {essay.prompt}
                            </p>
                          </div>
                        )}

                        {/* Draft textarea */}
                        <div className="pt-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[11px] font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>
                              DRAFT
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--admin-font-tertiary)" }}>
                              <span>{wc} words{essay.wordLimit ? ` / ${essay.wordLimit} limit` : ""}</span>
                              {essay.wordLimit && wc > essay.wordLimit && (
                                <span style={{ color: "var(--admin-accent-red)" }}>Over limit</span>
                              )}
                            </div>
                          </div>
                          <textarea
                            rows={8}
                            placeholder="Start writing your essay..."
                            value={draft}
                            onChange={(e) => onSetEssayDraft(essay.id, e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                            style={{
                              background: "var(--admin-bg-input)",
                              border: "1px solid var(--admin-border-default)",
                              color: "var(--admin-font-primary)",
                              lineHeight: "1.6",
                            }}
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => onSaveEssayDraft(essay.id)}
                            disabled={savingEssay === essay.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                            style={{ background: "var(--admin-accent-blue)" }}
                          >
                            {savingEssay === essay.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            Save Draft
                          </button>
                          <button
                            onClick={() => onRequestAiReview(essay.id)}
                            disabled={reviewingEssay === essay.id || !draft.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
                            style={{
                              background: "rgba(139,92,246,0.1)",
                              color: "var(--admin-accent-purple)",
                              border: "1px solid rgba(139,92,246,0.2)",
                            }}
                          >
                            {reviewingEssay === essay.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            AI Review
                          </button>
                        </div>

                        {/* AI Review result */}
                        <AnimatePresence>
                          {review && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="rounded-lg p-3 overflow-hidden"
                              style={{
                                background: "rgba(139,92,246,0.06)",
                                border: "1px solid rgba(139,92,246,0.2)",
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--admin-accent-purple)" }} />
                                <span className="text-[11px] font-semibold" style={{ color: "var(--admin-accent-purple)" }}>
                                  AI Feedback
                                </span>
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--admin-font-secondary)" }}>
                                {review}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
