"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  Check,
  CheckSquare,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChecklistItem, CATEGORY_LABELS, CATEGORY_ORDER } from "./types";
import { FormInput, LoadingRow, EmptyState } from "./shared";

interface ChecklistTabProps {
  checklist: ChecklistItem[];
  loadingChecklist: boolean;
  generatingChecklist: boolean;
  savingItem: string | null;
  showAddItem: boolean;
  newItem: { name: string; category: ChecklistItem["category"]; dueDate: string; notes: string };
  onToggleItem: (item: ChecklistItem) => void;
  onGenerateChecklist: () => void;
  onSetShowAddItem: (show: boolean) => void;
  onSetNewItem: (updater: (prev: { name: string; category: ChecklistItem["category"]; dueDate: string; notes: string }) => { name: string; category: ChecklistItem["category"]; dueDate: string; notes: string }) => void;
  onAddItem: () => void;
}

export function ChecklistTab({
  checklist,
  loadingChecklist,
  generatingChecklist,
  savingItem,
  showAddItem,
  newItem,
  onToggleItem,
  onGenerateChecklist,
  onSetShowAddItem,
  onSetNewItem,
  onAddItem,
}: ChecklistTabProps) {
  return (
    <motion.div
      key="checklist"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="space-y-3"
    >
      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold" style={{ color: "var(--admin-font-secondary)" }}>
          {checklist.filter((c) => c.isCompleted).length}/{checklist.length} completed
        </span>
        <div className="flex gap-2">
          <button
            onClick={onGenerateChecklist}
            disabled={generatingChecklist}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
            style={{
              background: "rgba(139,92,246,0.1)",
              color: "var(--admin-accent-purple)",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
          >
            {generatingChecklist ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Generate Checklist
          </button>
          <button
            onClick={() => onSetShowAddItem(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: "var(--admin-accent-blue)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </button>
        </div>
      </div>

      {/* Add item form */}
      <AnimatePresence>
        {showAddItem && (
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
                  New Item
                </span>
                <button onClick={() => onSetShowAddItem(false)}>
                  <X className="h-4 w-4" style={{ color: "var(--admin-font-tertiary)" }} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormInput
                  placeholder="Item name *"
                  value={newItem.name}
                  onChange={(v) => onSetNewItem((p) => ({ ...p, name: v }))}
                />
                <div>
                  <select
                    value={newItem.category}
                    onChange={(e) => onSetNewItem((p) => ({ ...p, category: e.target.value as ChecklistItem["category"] }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{
                      background: "var(--admin-bg-input)",
                      border: "1px solid var(--admin-border-default)",
                      color: "var(--admin-font-primary)",
                    }}
                  >
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <FormInput
                  placeholder="Due date"
                  type="date"
                  value={newItem.dueDate}
                  onChange={(v) => onSetNewItem((p) => ({ ...p, dueDate: v }))}
                />
                <FormInput
                  placeholder="Notes (optional)"
                  value={newItem.notes}
                  onChange={(v) => onSetNewItem((p) => ({ ...p, notes: v }))}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onAddItem}
                  disabled={!newItem.name.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                  style={{ background: "var(--admin-accent-blue)" }}
                >
                  Add
                </button>
                <button
                  onClick={() => onSetShowAddItem(false)}
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

      {/* Checklist grouped by category */}
      {loadingChecklist ? (
        <LoadingRow />
      ) : checklist.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-8 w-8" />}
          message="No checklist items yet. Generate an AI checklist or add items manually."
        />
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.filter((cat) => checklist.some((c) => c.category === cat)).map((cat) => {
            const items = checklist.filter((c) => c.category === cat);
            const done = items.filter((c) => c.isCompleted).length;
            return (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] uppercase tracking-wider font-bold"
                    style={{ color: "var(--admin-font-tertiary)" }}
                  >
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--admin-font-light)" }}>
                    {done}/{items.length}
                  </span>
                </div>
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    className="flex items-start gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: "var(--admin-bg-card)",
                      border: "1px solid var(--admin-border-default)",
                      opacity: item.isCompleted ? 0.6 : 1,
                    }}
                  >
                    <button
                      onClick={() => onToggleItem(item)}
                      disabled={savingItem === item.id}
                      className="mt-0.5 shrink-0 h-4 w-4 rounded flex items-center justify-center transition-colors"
                      style={{
                        background: item.isCompleted ? "var(--admin-accent-green)" : "transparent",
                        border: item.isCompleted ? "none" : "1.5px solid var(--admin-border-default)",
                      }}
                    >
                      {savingItem === item.id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                      ) : item.isCompleted ? (
                        <Check className="h-2.5 w-2.5 text-white" />
                      ) : null}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn("text-sm", item.isCompleted && "line-through")}
                        style={{ color: "var(--admin-font-primary)" }}
                      >
                        {item.itemName}
                      </span>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {item.dueDate && (
                          <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
                            <Calendar className="h-3 w-3" />
                            {item.dueDate}
                          </span>
                        )}
                        {item.notes && (
                          <span className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
                            {item.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
