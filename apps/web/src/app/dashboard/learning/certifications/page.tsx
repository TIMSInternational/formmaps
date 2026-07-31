"use client";

import React from "react";
import { motion } from "motion/react";
import {
  CheckCircle2,
  ArrowLeft,
  BookOpen,
  Clock,
  ExternalLink,
  Circle,
  Trophy,
  PlayCircle,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useRecommendedCourses, useUserEnrollments } from "@/hooks/useCourseQueries";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Skeleton } from "@/components/ui/skeleton";
import type { Course, CourseEnrollment } from "@/types/course";

export default function CertificationsPage() {
  const { t } = useTranslation();
  const { data: enrollmentData, isLoading } = useUserEnrollments();
  const { data: recData } = useRecommendedCourses();
  const { language } = useGlobalStore();

  const enrollments: CourseEnrollment[] = Array.isArray(enrollmentData)
    ? enrollmentData
    : (enrollmentData as { data?: CourseEnrollment[]; enrollments?: CourseEnrollment[] } | undefined)?.data
      || (enrollmentData as { data?: CourseEnrollment[]; enrollments?: CourseEnrollment[] } | undefined)?.enrollments
      || [];
  const recommendedCourses = recData?.courses || [];

  const enrolledCourses = enrollments;
  const completedCourses = enrollments.filter((e) => e.status === "completed");
  const inProgressCourses = enrollments.filter((e) => e.status === "in_progress" || e.status === "enrolled");

  // Combine: in-progress first, then completed, then top recommended (not enrolled)
  const enrolledIds = new Set(enrollments.map((e) => e.courseId));
  const suggestedCourses = recommendedCourses
    .filter((c: Course) => !enrolledIds.has(c.id))
    .slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto py-6">
      {/* Back link */}
      <Link
        href="/dashboard/learning"
        className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        {t("nav.learning", "Learning")}
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {t("courses.myCourses", "My Courses & Progress")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-lg">
          {t("courses.trackProgress", "Track your enrolled courses, completed certifications, and recommended next steps.")}
        </p>
      </motion.div>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-16 rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        </div>
      )}

      {!isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-5"
        >
          {/* Stats */}
          <div className="dash-card p-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#2E9098]/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-[#2E9098]" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground tabular-nums">{enrolledCourses.length}</p>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Enrolled</p>
                </div>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground tabular-nums">{inProgressCourses.length}</p>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">In Progress</p>
                </div>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground tabular-nums">{completedCourses.length}</p>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Completed</p>
                </div>
              </div>
            </div>
          </div>

          {/* In Progress */}
          {inProgressCourses.length > 0 && (
            <div className="dash-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold text-foreground">In Progress</h2>
              </div>
              <div className="space-y-3">
                {inProgressCourses.map((enrollment) => (
                  <EnrollmentRow key={enrollment.enrollmentId} enrollment={enrollment} status="in_progress" />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completedCourses.length > 0 && (
            <div className="dash-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-bold text-foreground">Completed</h2>
              </div>
              <div className="space-y-3">
                {completedCourses.map((enrollment) => (
                  <EnrollmentRow key={enrollment.enrollmentId} enrollment={enrollment} status="completed" />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {enrolledCourses.length === 0 && (
            <div className="dash-card p-8 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">No courses yet</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
                Browse the course catalog to find courses aligned with your career goals.
              </p>
              <Link
                href="/dashboard/learning/courses"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Browse Courses
              </Link>
            </div>
          )}

          {/* Suggested next courses */}
          {suggestedCourses.length > 0 && (
            <div className="dash-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-bold text-foreground">Suggested Next</h2>
                </div>
                <Link
                  href="/dashboard/learning/courses"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  View All →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {suggestedCourses.map((course: Course, idx: number) => (
                  <Link
                    key={course.id || `suggested-${idx}`}
                    href={course.courseraUrl || "/dashboard/learning/courses"}
                    target={course.courseraUrl ? "_blank" : undefined}
                    className="p-3.5 rounded-xl border border-border hover:border-foreground/20 transition-all group"
                  >
                    <h4 className="text-sm font-semibold text-foreground group-hover:text-indigo-600 transition-colors line-clamp-2 mb-1">
                      {course.title}
                    </h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2">
                      {course.provider}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {course.duration && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {course.duration}w
                        </span>
                      )}
                      {course.difficulty && (
                        <span className="px-1.5 py-0.5 rounded bg-secondary text-[9px] font-medium">
                          {course.difficulty}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function EnrollmentRow({ enrollment, status }: { enrollment: CourseEnrollment; status: "in_progress" | "completed" }) {
  const isComplete = status === "completed";

  return (
    <div className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all ${
      isComplete ? "border-emerald-200/60 bg-emerald-50/30" : "border-border hover:border-foreground/20"
    }`}>
      {/* Status icon */}
      {isComplete ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
      ) : (
        <Circle className="w-5 h-5 text-amber-400 shrink-0" />
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-foreground truncate">{enrollment.courseTitle}</h4>
        <div className="flex items-center gap-3 mt-0.5">
          {enrollment.progress && (
            <span className="text-[11px] text-muted-foreground">
              {enrollment.progress.completedModules}/{enrollment.progress.totalModules} modules
            </span>
          )}
          {enrollment.progress?.percentage != null && !isComplete && (
            <span className="text-[11px] text-amber-600 font-medium">
              {enrollment.progress.percentage}%
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      {enrollment.courseraUrl && (
        <a
          href={enrollment.courseraUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}
