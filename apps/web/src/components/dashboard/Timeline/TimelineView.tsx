"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ClipboardCheck,
  Brain,
  Users,
  BookOpen,
  Play,
  Check,
  Clock,
  Mail,
  UserPlus,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TimelineEvent,
  TimelineViewProps,
  TimelineIcon,
  TimelineColor,
  AssessmentType,
} from "@/types/timeline";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useGlobalStore } from "@/store/useGlobalStore";

/**
 * Icon mapping for timeline events
 */
const IconMap: Record<TimelineIcon, React.ElementType> = {
  "clipboard-check": ClipboardCheck,
  brain: Brain,
  users: Users,
  "book-open": BookOpen,
  play: Play,
  check: Check,
  clock: Clock,
  mail: Mail,
  "user-plus": UserPlus,
  "graduation-cap": GraduationCap,
};

/**
 * Color classes for different timeline colors
 */
const colorClasses: Record<
  TimelineColor,
  { bg: string; border: string; text: string; dot: string }
> = {
  green: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-600",
    dot: "bg-emerald-500",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-600",
    dot: "bg-blue-500",
  },
  yellow: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-600",
    dot: "bg-amber-500",
  },
  red: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-600",
    dot: "bg-red-500",
  },
  gray: {
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-600",
    dot: "bg-gray-400",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-600",
    dot: "bg-purple-500",
  },
};

/**
 * Assessment type badge styles
 */
const typeBadgeStyles: Record<
  AssessmentType,
  { bg: string; text: string; border: string; label: { en: string; sp: string } }
> = {
  pca: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
    label: { en: "PCA", sp: "PCA" },
  },
  mil: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
    label: { en: "LIA", sp: "LIA" },
  },
  evaluation: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    label: { en: "360°", sp: "360°" },
  },
  course: {
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
    label: { en: "Course", sp: "Curso" },
  },
};

/**
 * Format date for display
 */
function formatEventDate(
  dateString: string,
  language: "english" | "spanish"
): string {
  const date = new Date(dateString);
  const locale = language === "spanish" ? es : enUS;

  if (isToday(date)) {
    return language === "spanish" ? "Hoy" : "Today";
  }
  if (isYesterday(date)) {
    return language === "spanish" ? "Ayer" : "Yesterday";
  }

  return format(date, "MMM d, yyyy", { locale });
}

/**
 * Format time for display
 */
function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  return format(date, "h:mm a");
}

/**
 * Get relative time
 */
function getRelativeTime(
  dateString: string,
  language: "english" | "spanish"
): string {
  const date = new Date(dateString);
  const locale = language === "spanish" ? es : enUS;
  return formatDistanceToNow(date, { addSuffix: true, locale });
}

/**
 * Single timeline event card
 */
interface TimelineEventCardProps {
  event: TimelineEvent;
  isLast?: boolean;
  onClick?: () => void;
}

function TimelineEventCard({ event, isLast, onClick }: TimelineEventCardProps) {
  const { language } = useGlobalStore();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const IconComponent = IconMap[event.icon] || Check;
  const colors = colorClasses[event.color];
  const typeStyle = typeBadgeStyles[event.type];
  const langKey = language === "spanish" ? "sp" : "en";

  const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0;

  return (

    <div className="relative flex gap-6 pb-12 last:pb-0 group">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[22px] top-12 bottom-0 w-px bg-gray-100" aria-hidden="true" />
      )}

      {/* Timeline dot */}
      <div className="relative z-10 flex-shrink-0">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border bg-white transition-all duration-300 group-hover:scale-110",
            colors.border,
            colors.text
          )}
          aria-hidden="true"
        >
          <IconComponent className="h-5 w-5" strokeWidth={1.5} />
        </div>
      </div>

      {/* Event content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 min-w-0"
      >
        <div
          className={cn(
            "rounded-xl border bg-white p-5 transition-all duration-300 hover:shadow-sm hover:border-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500",
            "border-gray-100"
          )}
          onClick={() => onClick?.() || setIsExpanded(!isExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick?.() || setIsExpanded(!isExpanded);
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={hasMetadata ? isExpanded : undefined}
          aria-label={`${event.title}, ${event.type}. Click to ${isExpanded ? 'collapse' : 'expand'} details.`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border",
                    typeStyle.bg,
                    typeStyle.text,
                    typeStyle.border
                  )}
                >
                  {typeStyle.label[langKey]}
                </span>
                <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                  {formatEventTime(event.timestamp)}
                </span>
              </div>
              <h4 className="font-semibold text-gray-900 text-lg leading-tight tracking-tight">
                {event.title}
              </h4>
            </div>

            {hasMetadata && (
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center transition-transform duration-300 text-gray-400",
                  isExpanded ? "rotate-180 bg-gray-50 text-gray-600" : ""
                )}
                aria-hidden="true"
              >
                <ChevronDown className="h-4 w-4" />
              </div>
            )}
          </div>

          <p className="text-sm text-gray-500 leading-relaxed mb-4 font-normal">
            {event.description}
          </p>

          {/* Footer info */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-50">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full",
                  event.status === "completed"
                    ? "bg-emerald-50 text-emerald-700"
                    : event.status === "in_progress"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-gray-50 text-gray-600"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    event.status === "completed"
                      ? "bg-emerald-500"
                      : event.status === "in_progress"
                        ? "bg-blue-500"
                        : "bg-gray-400"
                  )}
                  aria-hidden="true"
                />
                {event.status === "completed"
                  ? language === "spanish"
                    ? "Completado"
                    : "Completed"
                  : event.status === "in_progress"
                    ? language === "spanish"
                      ? "En Progreso"
                      : "In Progress"
                    : language === "spanish"
                      ? "No Iniciado"
                      : "Not Started"}
              </span>
            </div>
            <span className="text-xs text-gray-400 font-medium">
              {getRelativeTime(event.timestamp, language)}
            </span>
          </div>

          {/* Expanded metadata */}
          <AnimatePresence>
            {isExpanded && hasMetadata && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="mt-4 pt-4 border-t border-dashed border-gray-100 overflow-hidden cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <EventMetadata event={event} language={language} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Event metadata display
 */
function EventMetadata({
  event,
  language,
}: {
  event: TimelineEvent;
  language: "english" | "spanish";
}) {
  const metadata = event.metadata as any;

  if (event.type === "mil") {
    return (
      <div className="flex items-center gap-4 text-sm bg-gray-50/30 p-3 rounded-lg border border-gray-100/50">
        {metadata.examName && (
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">
              {language === "spanish" ? "Subtest" : "Subtest"}
            </span>
            <span className="font-semibold text-gray-900 text-xs">
              {metadata.examName}
            </span>
          </div>
        )}
        {metadata.timeSpent && (
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">
              {language === "spanish" ? "Tiempo" : "Time"}
            </span>
            <span className="font-semibold text-gray-900 text-xs">
              {metadata.timeSpent}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (event.type === "evaluation") {
    return (
      <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50/30 p-4 rounded-lg border border-gray-100/50">
        {metadata.evaluatorName && (
          <div className="col-span-2 flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">
              {language === "spanish" ? "Evaluador" : "Evaluator"}
            </span>
            <span className="font-semibold text-gray-900 flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-[10px] font-bold border border-blue-100">
                {metadata.evaluatorName.charAt(0)}
              </div>
              {metadata.evaluatorName}
            </span>
          </div>
        )}
        {metadata.relation && (
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">
              {language === "spanish" ? "Relación" : "Relation"}
            </span>
            <span className="font-medium text-gray-700 bg-white px-2 py-1 rounded border border-gray-100 self-start text-xs shadow-sm">
              {metadata.relation}
            </span>
          </div>
        )}
        {metadata.groupType && (
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">
              {language === "spanish" ? "Tipo" : "Type"}
            </span>
            <span className="font-medium text-gray-700 text-xs">
              {metadata.groupType}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (event.type === "pca") {
    return (
      <div className="flex items-center gap-4 text-sm bg-gray-50/30 p-3 rounded-lg border border-gray-100/50">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">
            {language === "spanish" ? "Estado" : "Status"}
          </span>
          <span className="font-semibold text-gray-900 text-xs">
            {event.status === "completed"
              ? language === "spanish" ? "Completado" : "Completed"
              : language === "spanish" ? "En progreso" : "In Progress"}
          </span>
        </div>
      </div>
    );
  }

  if (event.type === "course") {
    return (
      <div className="space-y-4 bg-gray-50/30 p-4 rounded-lg border border-gray-100/50">
        {metadata.courseTitle && (
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">
              {language === "spanish" ? "Curso" : "Course"}
            </span>
            <span className="font-bold text-gray-900 text-lg tracking-tight">
              {metadata.courseTitle}
            </span>
          </div>
        )}

        {metadata.progress !== undefined && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500 font-medium">
                {language === "spanish" ? "Progreso" : "Progress"}
              </span>
              <span className="text-gray-900 font-bold">{metadata.progress.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${metadata.progress}%` }}
              />
            </div>
          </div>
        )}

        {metadata.completedModules !== undefined && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
            <BookOpen className="w-4 h-4 text-teal-500" />
            <span>
              <span className="font-bold text-gray-900">{metadata.completedModules}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span>{metadata.totalModules}</span>
              <span className="ml-1">{language === "spanish" ? "módulos" : "modules"}</span>
            </span>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Group events by date
 */
function groupEventsByDate(
  events: TimelineEvent[],
  language: "english" | "spanish"
): { date: string; events: TimelineEvent[]; isToday: boolean }[] {
  const groups: Map<string, TimelineEvent[]> = new Map();

  events.forEach((event) => {
    const date = new Date(event.timestamp);
    const dateKey = format(date, "yyyy-MM-dd");

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(event);
  });

  return Array.from(groups.entries())
    .map(([dateKey, events]) => {
      const date = new Date(dateKey);
      return {
        date: formatEventDate(events[0].timestamp, language),
        events,
        isToday: isToday(date),
      };
    })
    .sort(
      (a, b) =>
        new Date(b.events[0].timestamp).getTime() -
        new Date(a.events[0].timestamp).getTime()
    );
}

/**
 * Main Timeline View Component
 */
export function TimelineView({
  events,
  isLoading,
  onEventClick,
}: TimelineViewProps) {
  const { language } = useGlobalStore();

  if (isLoading) {
    return <TimelineViewSkeleton />;
  }

  if (!events || events.length === 0) {
    return <TimelineEmptyState language={language} />;
  }

  const groupedEvents = groupEventsByDate(events, language);

  return (
    <div className="space-y-10 pb-10">
      {groupedEvents.map((group, groupIndex) => (
        <div key={group.date} className="relative">
          {/* Date header */}
          <div className="sticky top-0 z-20 mb-8 flex items-center justify-center pointer-events-none">
            <div
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold shadow-sm border backdrop-blur-md transition-all duration-300 pointer-events-auto",
                group.isToday
                  ? "bg-blue-600 text-white border-blue-600 shadow-blue-100"
                  : "bg-white/80 text-gray-600 border-gray-200"
              )}
            >
              {group.date}
            </div>
          </div>

          {/* Events for this date */}
          <div className="space-y-2">
            {group.events.map((event, eventIndex) => (
              <TimelineEventCard
                key={event.id}
                event={event}
                isLast={
                  groupIndex === groupedEvents.length - 1 &&
                  eventIndex === group.events.length - 1
                }
                onClick={() => onEventClick?.(event)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Loading skeleton
 */
function TimelineViewSkeleton() {
  return (
    <div className="space-y-12 p-4">
      {[1, 2].map((group) => (
        <div key={group}>
          <div className="flex justify-center mb-8">
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
          <div className="space-y-8">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex gap-6">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" variant="circle" />
                <Skeleton className="flex-1 h-32 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state
 */
function TimelineEmptyState({ language }: { language: "english" | "spanish" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-dashed border-gray-200 m-4">
      <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
        <Clock className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">
        {language === "spanish"
          ? "No hay eventos"
          : "No timeline events"}
      </h3>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
        {language === "spanish"
          ? "Completa evaluaciones para ver tu progreso."
          : "Complete assessments to see your progress."}
      </p>
      <div className="mt-6">
        <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-100">
          {language === "spanish" ? "Ir a Evaluaciones" : "Go to Assessments"}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default TimelineView;
