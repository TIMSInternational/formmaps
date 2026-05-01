"use client";

import {
  Star,
  Clock,
  Users,
  Award,
  Globe,
  BookOpen,
  Target,
  CheckCircle,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Course, CourseEnrollment } from "@/types/course";

interface CourseDetailPanelProps {
  course: Course;
  enrollment?: CourseEnrollment;
  onStartCourse: (course: Course) => void | Promise<void>;
  onMarkCompleted?: (course: Course) => void | Promise<void>;
}

export function CourseDetailPanel({
  course,
  enrollment,
  onStartCourse,
  onMarkCompleted,
}: CourseDetailPanelProps) {
  const difficultyColor =
    course.difficulty === "Beginner" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
    course.difficulty === "Intermediate" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
    course.difficulty === "Advanced" ? "bg-red-500/10 text-red-400 border-red-500/20" :
    "bg-gray-500/10 text-gray-400 border-gray-500/20";

  return (
    <div className="space-y-5">
      {/* Title + Provider */}
      <div>
        <h3 className="text-base font-bold leading-tight" style={{ color: "var(--admin-font-primary)" }}>
          {course.title}
        </h3>
        <div className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
          <BookOpen className="h-3 w-3" />
          <span>{course.provider}</span>
          {course.instructor && (
            <>
              <span style={{ color: "var(--admin-border-default)" }}>·</span>
              <span>{course.instructor}</span>
            </>
          )}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className={cn("text-[11px] px-2 py-1 rounded-md border font-medium", difficultyColor)}>
          {course.difficulty}
        </span>
        <span className="text-[11px] px-2 py-1 rounded-md font-medium" style={{ background: "var(--admin-accent-bg-blue)", color: "var(--admin-accent-blue)", border: "1px solid var(--admin-accent-border-blue)" }}>
          {course.category}
        </span>
        {course.certificate && (
          <span className="text-[11px] px-2 py-1 rounded-md font-medium flex items-center gap-1" style={{ background: "var(--admin-accent-bg-purple)", color: "var(--admin-accent-purple)", border: "1px solid var(--admin-accent-border-purple)" }}>
            <Award className="h-3 w-3" /> Certificate
          </span>
        )}
        {enrollment?.status === "completed" && (
          <span className="text-[11px] px-2 py-1 rounded-md font-medium flex items-center gap-1" style={{ background: "var(--admin-accent-bg-green)", color: "var(--admin-accent-green)", border: "1px solid var(--admin-accent-border-green)" }}>
            <CheckCircle className="h-3 w-3" /> Completed
          </span>
        )}
        {enrollment && enrollment.status !== "completed" && (
          <span className="text-[11px] px-2 py-1 rounded-md font-medium" style={{ background: "var(--admin-accent-bg-amber)", color: "var(--admin-accent-amber)", border: "1px solid var(--admin-accent-border-amber)" }}>
            In Progress
          </span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox icon={Star} label="Rating" value={`${course.rating.toFixed(1)} (${course.reviewCount})`} accent="text-amber-400" />
        <StatBox icon={Clock} label="Duration" value={`${course.duration} weeks`} accent="text-blue-400" />
        <StatBox icon={Users} label="Students" value={course.enrollmentCount.toLocaleString()} accent="text-emerald-400" />
        <StatBox icon={Globe} label="Language" value={course.language} accent="text-purple-400" />
      </div>

      {/* Description */}
      {(course.fullDescription || course.shortDescription) && (
        <div className="space-y-2">
          <SectionLabel icon={BookOpen} label="About" />
          <p className="text-sm leading-relaxed" style={{ color: "var(--admin-font-tertiary)" }}>
            {course.fullDescription || course.shortDescription}
          </p>
        </div>
      )}

      {/* Skills */}
      {course.skills && course.skills.length > 0 && (
        <div className="space-y-2">
          <SectionLabel icon={Target} label="Skills You'll Learn" />
          <div className="flex flex-wrap gap-1.5">
            {course.skills.map((s, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-md" style={{ background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)", border: "1px solid var(--admin-border-light)" }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Syllabus */}
      {course.syllabus && course.syllabus.length > 0 && (
        <div className="space-y-2">
          <SectionLabel icon={BookOpen} label={`Syllabus (${course.syllabus.length} modules)`} />
          <div className="space-y-1">
            {course.syllabus.slice(0, 8).map((mod, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-light)" }}>
                <span className="text-[10px] font-bold w-5 text-center" style={{ color: "var(--admin-font-tertiary)" }}>{i + 1}</span>
                <span className="text-xs" style={{ color: "var(--admin-font-secondary)" }}>{typeof mod === "string" ? mod : (mod as any).title || (mod as any).name || `Module ${i + 1}`}</span>
              </div>
            ))}
            {course.syllabus.length > 8 && (
              <p className="text-[11px] text-center pt-1" style={{ color: "var(--admin-font-tertiary)" }}>
                +{course.syllabus.length - 8} more modules
              </p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {!enrollment || enrollment.status === "dropped" ? (
          <button
            onClick={() => onStartCourse(course)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--admin-accent-blue)" }}
          >
            Start Learning
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        ) : enrollment.status === "completed" ? (
          <button
            onClick={() => window.open(course.courseraUrl, "_blank")}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)" }}
          >
            Review Course
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="flex gap-2 w-full">
            <button
              onClick={() => window.open(course.courseraUrl, "_blank")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--admin-accent-blue)" }}
            >
              Continue
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            {onMarkCompleted && (
              <button
                onClick={() => onMarkCompleted(course)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ border: "1px solid var(--admin-accent-border-green)", color: "var(--admin-accent-green)", background: "var(--admin-accent-bg-green)" }}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--admin-font-tertiary)" }}>{label}</span>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center p-2.5 rounded-lg" style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-light)" }}>
      <Icon className={cn("h-3.5 w-3.5 mb-1", accent)} />
      <span className="text-sm font-bold" style={{ color: "var(--admin-font-primary)" }}>{value}</span>
      <span className="text-[10px] mt-0.5" style={{ color: "var(--admin-font-tertiary)" }}>{label}</span>
    </div>
  );
}
