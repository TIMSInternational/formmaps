"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Check,
  FileText,
  Target,
  Briefcase,
  GraduationCap,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const DISMISSED_KEY = "formmaps_welcome_dismissed";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  completed: boolean;
}

interface WelcomeChecklistProps {
  userName?: string;
  pcaCompleted?: boolean;
  milCompleted?: boolean;
  careerExplored?: boolean;
  coursesStarted?: boolean;
}

export function WelcomeChecklist({
  userName,
  pcaCompleted = false,
  milCompleted = false,
  careerExplored = false,
  coursesStarted = false,
}: WelcomeChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === "true";
    setDismissed(wasDismissed);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, "true");
  };

  const items: ChecklistItem[] = [
    { id: "pca", label: "Take PCA Assessment", description: "Discover your personality profile", href: "/dashboard/assessments/pca", icon: FileText, completed: pcaCompleted },
    { id: "mil", label: "Take MIL Assessment", description: "Measure your cognitive abilities", href: "/dashboard/assessments/lia", icon: Target, completed: milCompleted },
    { id: "career", label: "Explore Career Matches", description: "See your top 10 career paths", href: "/dashboard/career-paths", icon: Briefcase, completed: careerExplored },
    { id: "courses", label: "Start a Course", description: "Begin building your skills", href: "/dashboard/learning/courses", icon: BookOpen, completed: coursesStarted },
  ];

  const completedCount = items.filter((i) => i.completed).length;
  const allDone = completedCount === items.length;

  if (dismissed || allDone) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--admin-bg-card)",
          border: "1px solid var(--admin-border-default)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--admin-border-light)" }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--admin-font-primary)" }}>
              Welcome{userName ? `, ${userName}` : ""}! Let's get started
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--admin-font-tertiary)" }}>
              {completedCount} of {items.length} steps completed
            </div>
          </div>
          <button
            onClick={dismiss}
            className="p-1 rounded-md transition-colors"
            style={{ color: "var(--admin-font-tertiary)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-5 py-2">
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: "var(--admin-bg-hover)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--admin-accent-green)" }}
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / items.length) * 100}%` }}
              transition={{ duration: 0.6, delay: 0.3 }}
            />
          </div>
        </div>

        {/* Items */}
        <div className="px-3 pb-3 space-y-1">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.completed ? "#" : item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${item.completed ? "pointer-events-none" : ""}`}
                style={{
                  background: item.completed ? "transparent" : "var(--admin-bg-hover)",
                  opacity: item.completed ? 0.5 : 1,
                }}
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    background: item.completed ? "var(--admin-accent-green)" : "var(--admin-bg-card)",
                    border: item.completed ? "none" : "1px solid var(--admin-border-default)",
                  }}
                >
                  {item.completed ? (
                    <Check className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs font-semibold"
                    style={{
                      color: item.completed ? "var(--admin-font-tertiary)" : "var(--admin-font-primary)",
                      textDecoration: item.completed ? "line-through" : "none",
                    }}
                  >
                    {item.label}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--admin-font-tertiary)" }}>
                    {item.description}
                  </div>
                </div>
                {!item.completed && (
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--admin-font-tertiary)" }} />
                )}
              </Link>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
