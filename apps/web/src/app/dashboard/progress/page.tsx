"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Target,
  Flag,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Zap,
  BookOpen,
  Award,
  TrendingUp,
  Flame
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Mock data for demonstration
const progressStats = {
  coursesCompleted: 5,
  hoursLearned: 42,
  currentStreak: 7,
  certificatesEarned: 3
};

const recentActivity = [
  { id: 1, type: "completed", title: "React Fundamentals", date: "2 days ago", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  { id: 2, type: "progress", title: "Advanced TypeScript", date: "Today", icon: BookOpen, color: "text-blue-600 bg-blue-50 border-blue-100" },
  { id: 3, type: "started", title: "Node.js Masterclass", date: "Yesterday", icon: Flag, color: "text-amber-600 bg-amber-50 border-amber-100" },
];

const milestones = [
  { id: 1, title: "First Course Completed", description: "Finish your first course", achieved: true, icon: Award },
  { id: 2, title: "7-Day Streak", description: "Learn for 7 consecutive days", achieved: true, icon: Flame },
  { id: 3, title: "Skill Master", description: "Complete 5 courses in one skill area", achieved: false, progress: 60, icon: Target },
  { id: 4, title: "Certificate Collector", description: "Earn 5 certificates", achieved: false, progress: 60, icon: CheckCircle2 },
];

export default function ProgressMilestonesPage() {
  const { t } = useTranslation();

  return (
    <main className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh]">
      <div className="space-y-5">

        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Your Journey</p>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none mt-1">Progress Milestones</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Track your learning journey and celebrate your achievements.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-600">
              {progressStats.currentStreak} day streak
            </span>
            <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-blue-200 bg-blue-50 text-blue-600">
              {progressStats.certificatesEarned} certs
            </span>
          </div>
        </motion.header>

        {/* Stats Cards Row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <div className="dash-card p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground">Courses Completed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{progressStats.coursesCompleted}</p>
          </div>

          <div className="dash-card p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Hours Learned</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{progressStats.hoursLearned}h</p>
          </div>

          <div className="dash-card p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <Flame className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Day Streak</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{progressStats.currentStreak}</p>
          </div>

          <div className="dash-card p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <Award className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">Certificates</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{progressStats.certificatesEarned}</p>
          </div>
        </motion.div>

        {/* Main Content Grid */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-5"
        >
          {/* Left: Milestones */}
          <div className="lg:col-span-7">
            <div className="dash-card p-5">
              <div className="flex items-center gap-3 mb-5">
                <Target className="w-4 h-4 text-foreground" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Milestones</h3>
                  <p className="text-xs text-muted-foreground">Track your learning achievements</p>
                </div>
              </div>

              <div className="space-y-3">
                {milestones.map((milestone, index) => (
                  <motion.div
                    key={milestone.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.08 }}
                    className={`p-3.5 rounded-xl border flex items-center gap-3.5 transition-colors ${
                      milestone.achieved
                        ? "bg-emerald-50/50 border-emerald-200"
                        : "bg-card border-border hover:border-foreground/20"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${
                      milestone.achieved
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-secondary text-muted-foreground"
                    }`}>
                      <milestone.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-foreground">{milestone.title}</h4>
                      <p className="text-xs text-muted-foreground">{milestone.description}</p>
                      {!milestone.achieved && milestone.progress && (
                        <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-foreground/60 rounded-full"
                            style={{ width: `${milestone.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {milestone.achieved && (
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-600 shrink-0">
                        Achieved
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Recent Activity */}
          <div className="lg:col-span-5">
            <div className="dash-card p-5 lg:sticky lg:top-8">
              <div className="flex items-center gap-3 mb-5">
                <TrendingUp className="w-4 h-4 text-foreground" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Recent Activity</h3>
                  <p className="text-xs text-muted-foreground">Your learning timeline</p>
                </div>
              </div>

              <div className="space-y-2">
                {recentActivity.map((activity, index) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 + index * 0.08 }}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <div className={`p-2 rounded-lg border ${activity.color}`}>
                      <activity.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-foreground truncate">{activity.title}</h4>
                      <p className="text-xs text-muted-foreground">{activity.date}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <Button
                variant="outline"
                className="w-full mt-5 rounded-xl border-border text-xs text-muted-foreground hover:text-foreground"
              >
                View All Activity
              </Button>
            </div>
          </div>
        </motion.div>

      </div>
    </main>
  );
}
