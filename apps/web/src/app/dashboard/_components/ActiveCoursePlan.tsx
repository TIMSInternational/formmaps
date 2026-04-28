"use client";

import { motion } from "framer-motion";
import { PremiumCard } from "./PremiumCard";
import { useTranslation } from "react-i18next";
import { CheckCircle, PlayCircle, LockKey, DotsThree, BookOpen } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface CourseModule {
  id: string | number;
  title: string;
  status: "completed" | "active" | "locked";
  duration?: string;
}

interface ActiveCourse {
  title: string;
  progress: number;
  modules?: CourseModule[];
  courseId?: string;
}

interface ActiveCoursePlanProps {
  courseData?: ActiveCourse | null;
}

export function ActiveCoursePlan({ courseData }: ActiveCoursePlanProps) {
  const { t } = useTranslation();

  const hasCourse = !!courseData?.title;

  // Normalize modules from backend data or use empty
  const modules: CourseModule[] = courseData?.modules?.length
    ? courseData.modules
    : [];

  if (!hasCourse) {
    return (
      <div className="w-full h-full">
        <PremiumCard innerClassName="flex flex-col h-full bg-transparent backdrop-blur-md p-0 relative overflow-hidden">
          <div className="p-8 pb-6 border-b border-slate-100/80 bg-white/40 backdrop-blur-md/50">
            <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-white/60 backdrop-blur-md border border-slate-200/50 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {t("dashboard.activeCourse")}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center flex-grow p-8 text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-white/40 backdrop-blur-md border border-slate-100 flex items-center justify-center">
              <BookOpen weight="duotone" className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <h3 className="font-sans text-xl font-bold text-slate-900 tracking-tight mb-1">
                {t("dashboard.noCourseEnrolled")}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed max-w-[28ch]">
                {t("dashboard.noCourseDesc")}
              </p>
            </div>
            <Link
              href="/dashboard/learning/courses"
              className="group flex items-center justify-center w-full px-6 py-3.5 rounded-full transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold tracking-tight"
            >
              {t("dashboard.exploreCourses")}
            </Link>
          </div>
        </PremiumCard>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <PremiumCard innerClassName="flex flex-col h-full bg-transparent backdrop-blur-md p-0 relative overflow-hidden group/plan shadow-xl">
        {/* Header Area */}
        <div className="p-8 pb-6 border-b border-slate-100/80 bg-white/40 backdrop-blur-md/50">
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-100/50 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
                {t("dashboard.activeCourse")}
              </span>
            </div>
            <Link href="/dashboard/learning" className="text-slate-400 hover:text-slate-900 transition-colors p-1" aria-label="Go to learning">
              <DotsThree weight="bold" className="w-5 h-5" />
            </Link>
          </div>

          <h3 className="font-sans text-2xl font-bold text-slate-900 tracking-tight leading-tight">
            {courseData.title}
          </h3>
          <div className="flex items-center gap-3 mt-4">
            <div className="w-full h-1.5 bg-white/30 shadow-inner rounded-full overflow-hidden shadow-inner">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${courseData.progress || 0}%` }}
                transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
                className="h-full bg-indigo-600 rounded-full relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full animate-[shimmer_2s_infinite]" />
              </motion.div>
            </div>
            <span className="text-xs font-bold text-slate-500 tabular-nums shrink-0">{courseData.progress || 0}%</span>
          </div>
        </div>

        {/* Module List */}
        <div className="p-6 flex-grow flex flex-col gap-1 relative z-10">
          <motion.div
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { staggerChildren: 0.08 } }
            }}
            initial="hidden"
            animate="show"
            className="space-y-2"
          >
            {modules.length > 0 ? modules.map((mod) => (
              <motion.div
                key={mod.id}
                layoutId={`module-${mod.id}`}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut" } }
                }}
                className={cn(
                  "group flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 relative overflow-hidden",
                  mod.status === "active" ? "bg-transparent backdrop-blur-md border-indigo-100 shadow-[0_8px_16px_-4px_rgba(99,102,241,0.1)] ring-1 ring-indigo-50" :
                  mod.status === "completed" ? "bg-white/40 backdrop-blur-md/50 border-transparent hover:bg-white/40 backdrop-blur-md" :
                  "bg-transparent border-transparent opacity-60"
                )}
              >
                <div className="flex items-center gap-4 relative z-10">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0">
                    {mod.status === "completed" && <CheckCircle weight="fill" className="w-6 h-6 text-emerald-500" />}
                    {mod.status === "active" && (
                      <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-20" />
                        <PlayCircle weight="fill" className="w-7 h-7 text-indigo-600 shadow-sm rounded-full bg-transparent backdrop-blur-md relative z-10" />
                      </div>
                    )}
                    {mod.status === "locked" && <LockKey weight="duotone" className="w-5 h-5 text-slate-400" />}
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-sm tracking-tight",
                      mod.status === "active" ? "font-bold text-slate-900" :
                      mod.status === "completed" ? "font-bold text-slate-700" :
                      "font-medium text-slate-500"
                    )}>{mod.title}</span>
                    {mod.duration && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">{mod.duration}</span>
                    )}
                  </div>
                </div>
                {mod.status === "active" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2 shadow-[0_0_8px_rgba(99,102,241,0.8)] relative z-10" />
                )}
              </motion.div>
            )) : (
              <div className="text-center py-4 text-sm text-slate-400">
                {/* No modules in response — show a Continue button */}
              </div>
            )}
          </motion.div>
        </div>

        {/* Hover Toolbar */}
        <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-white via-white to-transparent translate-y-full opacity-0 group-hover/plan:translate-y-0 group-hover/plan:opacity-100 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] z-20">
          <Link
            href={courseData.courseId ? `/dashboard/learning/courses/${courseData.courseId}` : "/dashboard/learning"}
            className="flex items-center justify-center w-full py-3.5 bg-slate-900 text-white rounded-full text-sm font-bold tracking-tight shadow-xl shadow-slate-900/10 hover:bg-indigo-600 transition-colors"
          >
            {t("dashboard.continueLearning")}
          </Link>
        </div>
      </PremiumCard>
    </div>
  );
}
