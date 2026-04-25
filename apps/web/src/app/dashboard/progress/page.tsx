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

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, type: "spring" as const, stiffness: 100, damping: 20 }
  })
};

export default function ProgressMilestonesPage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        
        {/* Header Section */}
        <div className="space-y-6">
           <Link 
             href="/dashboard" 
             className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors group"
           >
               <div className="p-1.5 rounded-lg bg-white border border-slate-200 mr-2 group-hover:border-indigo-200 transition-all">
                  <ArrowLeft className="w-4 h-4" />
               </div>
               Back to Dashboard
           </Link>
           
           <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
               <div className="space-y-4 max-w-2xl">
                   <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5 fill-emerald-600" />
                      Your Journey
                   </div>
                   <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                      Progress <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">Milestones</span>
                   </h1>
                   <p className="text-slate-500 text-lg leading-relaxed">
                      Track your learning journey and celebrate your achievements.
                   </p>
               </div>
           </div>
        </div>

        {/* Stats Cards - Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div 
            custom={0} initial="hidden" animate="visible" variants={cardVariants}
            className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 transition-colors"
          >
            <div className="p-2 bg-emerald-50 rounded-lg w-fit mb-4 border border-emerald-100">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900">{progressStats.coursesCompleted}</p>
            <p className="text-sm text-slate-500 font-medium">Courses Completed</p>
          </motion.div>

          <motion.div 
            custom={1} initial="hidden" animate="visible" variants={cardVariants}
            className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 transition-colors"
          >
            <div className="p-2 bg-blue-50 rounded-lg w-fit mb-4 border border-blue-100">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900">{progressStats.hoursLearned}h</p>
            <p className="text-sm text-slate-500 font-medium">Hours Learned</p>
          </motion.div>

          <motion.div 
            custom={2} initial="hidden" animate="visible" variants={cardVariants}
            className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-amber-300 transition-colors"
          >
            <div className="p-2 bg-amber-50 rounded-lg w-fit mb-4 border border-amber-100">
              <Flame className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900">{progressStats.currentStreak}</p>
            <p className="text-sm text-slate-500 font-medium">Day Streak 🔥</p>
          </motion.div>

          <motion.div 
            custom={3} initial="hidden" animate="visible" variants={cardVariants}
            className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 transition-colors"
          >
            <div className="p-2 bg-purple-50 rounded-lg w-fit mb-4 border border-purple-100">
              <Award className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900">{progressStats.certificatesEarned}</p>
            <p className="text-sm text-slate-500 font-medium">Certificates</p>
          </motion.div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left: Milestones */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-200">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-slate-100 rounded-xl">
                  <Target className="w-6 h-6 text-slate-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-xl">Milestones</h3>
                  <p className="text-slate-500 text-sm">Track your learning achievements</p>
                </div>
              </div>

              <div className="space-y-4">
                {milestones.map((milestone, index) => (
                  <motion.div 
                    key={milestone.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + index * 0.1 }}
                    className={`p-4 rounded-2xl border flex items-center gap-4 transition-colors ${
                      milestone.achieved 
                        ? "bg-emerald-50/50 border-emerald-200" 
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className={`p-3 rounded-xl ${
                      milestone.achieved 
                        ? "bg-emerald-100 text-emerald-600" 
                        : "bg-slate-100 text-slate-400"
                    }`}>
                      <milestone.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900">{milestone.title}</h4>
                      <p className="text-sm text-slate-500">{milestone.description}</p>
                      {!milestone.achieved && milestone.progress && (
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 rounded-full" 
                            style={{ width: `${milestone.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {milestone.achieved && (
                      <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                        Achieved ✓
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Recent Activity */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-200 lg:sticky lg:top-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-slate-100 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-slate-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-xl">Recent Activity</h3>
                  <p className="text-slate-500 text-sm">Your learning timeline</p>
                </div>
              </div>

              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <motion.div 
                    key={activity.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className={`p-2.5 rounded-xl border ${activity.color}`}>
                      <activity.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900 text-sm">{activity.title}</h4>
                      <p className="text-xs text-slate-500">{activity.date}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <Button variant="outline" className="w-full mt-6 rounded-xl border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200">
                View All Activity
              </Button>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
