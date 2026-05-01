"use client";

import { motion } from "motion/react";
import {
  FileText,
  Target,
  BookOpen,
  GraduationCap,
  Briefcase,
  Award,
  Check,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

interface Milestone {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  completed: boolean;
  href: string;
}

interface JourneyProgressProps {
  pcaCompleted?: boolean;
  milCompleted?: boolean;
  careerExplored?: boolean;
  coursesStarted?: boolean;
  resumeBuilt?: boolean;
  portfolioStarted?: boolean;
}

export function JourneyProgress({
  pcaCompleted = false,
  milCompleted = false,
  careerExplored = false,
  coursesStarted = false,
  resumeBuilt = false,
  portfolioStarted = false,
}: JourneyProgressProps) {
  const milestones: Milestone[] = [
    { id: "pca", label: "PCA Assessment", description: "Personality profile", icon: FileText, completed: pcaCompleted, href: "/dashboard/assessments/pca" },
    { id: "mil", label: "MIL Assessment", description: "Cognitive abilities", icon: Target, completed: milCompleted, href: "/dashboard/assessments/mil" },
    { id: "career", label: "Career Explorer", description: "Find your match", icon: Briefcase, completed: careerExplored, href: "/dashboard/career-paths" },
    { id: "courses", label: "Start Learning", description: "Enroll in courses", icon: BookOpen, completed: coursesStarted, href: "/dashboard/learning/courses" },
    { id: "resume", label: "Build Resume", description: "AI-powered builder", icon: Award, completed: resumeBuilt, href: "/dashboard/resumes" },
    { id: "portfolio", label: "Portfolio", description: "Showcase your work", icon: GraduationCap, completed: portfolioStarted, href: "/dashboard/portfolio" },
  ];

  const completedCount = milestones.filter((m) => m.completed).length;
  const totalCount = milestones.length;
  const percent = Math.round((completedCount / totalCount) * 100);

  // Find next action
  const nextMilestone = milestones.find((m) => !m.completed);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--admin-bg-card)",
        border: "1px solid var(--admin-border-default)",
      }}
    >
      {/* Header with progress ring */}
      <div className="flex items-center gap-5 px-6 pt-5 pb-4">
        {/* Progress ring */}
        <div className="relative shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle
              cx="32" cy="32" r="28"
              fill="none"
              strokeWidth="5"
              style={{ stroke: "var(--admin-border-default)" }}
            />
            <motion.circle
              cx="32" cy="32" r="28"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              style={{ stroke: "var(--admin-accent-green)" }}
              strokeDasharray={`${2 * Math.PI * 28}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - percent / 100) }}
              transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-lg font-bold"
              style={{ color: "var(--admin-font-primary)" }}
            >
              {percent}%
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] font-bold uppercase tracking-wider mb-1"
            style={{ color: "var(--admin-font-light)" }}
          >
            Career Readiness
          </div>
          <div
            className="text-base font-semibold"
            style={{ color: "var(--admin-font-primary)" }}
          >
            {completedCount} of {totalCount} milestones
          </div>
          {nextMilestone && (
            <Link
              href={nextMilestone.href}
              className="inline-flex items-center gap-1 text-xs font-medium mt-1 transition-colors"
              style={{ color: "var(--admin-accent-blue)" }}
            >
              Next: {nextMilestone.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Milestone badges */}
      <div
        className="grid grid-cols-3 sm:grid-cols-6 gap-px"
        style={{ background: "var(--admin-border-light)", borderTop: "1px solid var(--admin-border-light)" }}
      >
        {milestones.map((m, idx) => {
          const Icon = m.icon;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + idx * 0.06 }}
            >
              <Link
                href={m.href}
                className="flex flex-col items-center gap-1.5 py-3 px-2 transition-colors"
                style={{
                  background: m.completed
                    ? "var(--admin-accent-bg-green, rgba(16,185,129,0.1))"
                    : "var(--admin-bg-card)",
                }}
              >
                <div
                  className="relative flex items-center justify-center rounded-full"
                  style={{
                    width: 32,
                    height: 32,
                    background: m.completed
                      ? "var(--admin-accent-green)"
                      : "var(--admin-bg-hover)",
                    border: m.completed ? "none" : "1px solid var(--admin-border-default)",
                  }}
                >
                  {m.completed ? (
                    <Check className="h-4 w-4 text-white" />
                  ) : (
                    <Icon
                      className="h-3.5 w-3.5"
                      style={{ color: "var(--admin-font-tertiary)" }}
                    />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium text-center leading-tight"
                  style={{
                    color: m.completed
                      ? "var(--admin-accent-green)"
                      : "var(--admin-font-tertiary)",
                  }}
                >
                  {m.label}
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
