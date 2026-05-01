"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Settings2,
  X,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
} from "lucide-react";

export interface WidgetConfig {
  id: string;
  label: string;
  visible: boolean;
}

const STORAGE_KEY = "nexa_dashboard_widgets";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "stats", label: "Stat Cards", visible: true },
  { id: "career-matches", label: "Career Matches", visible: true },
  { id: "quick-actions", label: "Quick Actions", visible: true },
  { id: "cognitive", label: "Cognitive Profile (PCA + MIL)", visible: true },
  { id: "journey", label: "Journey Progress", visible: true },
  { id: "bottom-trio", label: "Universities, Skills & Portfolio", visible: true },
];

function loadWidgets(): WidgetConfig[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved)) return saved;
  } catch {}
  return DEFAULT_WIDGETS;
}

function saveWidgets(widgets: WidgetConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

export function useDashboardWidgets() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);

  useEffect(() => {
    setWidgets(loadWidgets());
  }, []);

  const updateWidgets = useCallback((next: WidgetConfig[]) => {
    setWidgets(next);
    saveWidgets(next);
  }, []);

  const isVisible = useCallback(
    (id: string) => widgets.find((w) => w.id === id)?.visible ?? true,
    [widgets],
  );

  const reset = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    saveWidgets(DEFAULT_WIDGETS);
  }, []);

  return { widgets, updateWidgets, isVisible, reset };
}

interface DashboardCustomizerProps {
  widgets: WidgetConfig[];
  onUpdate: (widgets: WidgetConfig[]) => void;
  onReset: () => void;
}

export function DashboardCustomizer({ widgets, onUpdate, onReset }: DashboardCustomizerProps) {
  const [open, setOpen] = useState(false);

  const toggleWidget = (id: string) => {
    onUpdate(widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  };

  const moveWidget = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= widgets.length) return;
    const next = [...widgets];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onUpdate(next);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
        style={{
          color: "var(--admin-font-tertiary)",
          border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)",
        }}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Customize
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.3)" }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[340px] rounded-xl overflow-hidden"
              style={{
                background: "var(--admin-bg-card)",
                border: "1px solid var(--admin-border-default)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid var(--admin-border-default)" }}
              >
                <span className="text-xs font-bold" style={{ color: "var(--admin-font-primary)" }}>
                  Customize Dashboard
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={onReset}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
                    style={{ color: "var(--admin-font-tertiary)" }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </button>
                  <button onClick={() => setOpen(false)} className="p-1" style={{ color: "var(--admin-font-tertiary)" }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Widget list */}
              <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
                {widgets.map((w, idx) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors"
                    style={{
                      background: w.visible ? "var(--admin-bg-hover)" : "transparent",
                      border: "1px solid var(--admin-border-light)",
                      opacity: w.visible ? 1 : 0.5,
                    }}
                  >
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveWidget(idx, -1)}
                        disabled={idx === 0}
                        className="text-[8px] leading-none disabled:opacity-20"
                        style={{ color: "var(--admin-font-tertiary)" }}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveWidget(idx, 1)}
                        disabled={idx === widgets.length - 1}
                        className="text-[8px] leading-none disabled:opacity-20"
                        style={{ color: "var(--admin-font-tertiary)" }}
                      >
                        ▼
                      </button>
                    </div>

                    <span
                      className="flex-1 text-xs font-medium"
                      style={{ color: "var(--admin-font-primary)" }}
                    >
                      {w.label}
                    </span>

                    <button
                      onClick={() => toggleWidget(w.id)}
                      className="p-1 rounded transition-colors"
                      style={{ color: w.visible ? "var(--admin-accent-blue)" : "var(--admin-font-tertiary)" }}
                    >
                      {w.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
