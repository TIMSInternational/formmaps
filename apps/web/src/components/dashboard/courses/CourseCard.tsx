"use client";
import { motion } from "motion/react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Course } from "@/types/course";
import { useTranslation } from "react-i18next";
import { Star, Clock, Users, Award, CheckCircle2, ArrowUpRight, BookOpen } from "lucide-react";

interface CourseCardProps {
  course: Course;
  onViewDetails: (course: Course) => void;
  onStartCourse: (course: Course) => void | Promise<void>;
  isRecommended?: boolean;
  isEnrolled?: boolean;
  enrollmentStatus?: "enrolled" | "in_progress" | "completed" | "dropped";
  onMarkCompleted?: (course: Course) => void | Promise<void>;
}

export function CourseCard({
  course,
  onViewDetails,
  onStartCourse,
  isRecommended = false,
  isEnrolled = false,
  enrollmentStatus,
  onMarkCompleted,
}: CourseCardProps) {
  const { t } = useTranslation();

  const formatDuration = (weeks: number) => {
    return `${weeks} ${weeks === 1 ? t("courses.week") : t("courses.weeks")}`;
  };

  const formatRating = (rating: number) => {
    return (rating ?? 0).toFixed(1);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "Intermediate":
        return "bg-amber-50 text-amber-700 border-amber-100";
      case "Advanced":
        return "bg-rose-50 text-rose-700 border-rose-100";
      default:
        return "bg-gray-50 text-gray-700 border-gray-100";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <article 
        className="bg-white rounded-3xl p-5 hover:shadow-xl transition-all duration-300 cursor-pointer group relative overflow-hidden border border-gray-100 h-full flex flex-col"
        onClick={() => onViewDetails(course)}
        aria-labelledby={`course-${course.id}-title`}
      >
        {/* Hover Gradient Overlay */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />

        {/* Thumbnail & Badges */}
        <div className="relative h-40 w-full rounded-2xl overflow-hidden mb-5">
          <Image
            src={course.thumbnailUrl}
            alt={course.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {isRecommended && (
              <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-none shadow-sm backdrop-blur-sm">
                {t("courses.recommended")}
              </Badge>
            )}
            {isEnrolled && enrollmentStatus !== "completed" && (
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-sm backdrop-blur-sm">
                {t("courses.inProgress")}
              </Badge>
            )}
            {enrollmentStatus === "completed" && (
              <Badge className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm backdrop-blur-sm gap-1">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                {t("courses.completed")}
              </Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col flex-grow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 id={`course-${course.id}-title`} className="font-bold text-lg text-gray-900 leading-tight group-hover:text-blue-600 transition-colors line-clamp-2 mb-1">
                {course.title}
              </h3>
              <p className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                {course.provider}
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-600 line-clamp-2 mb-5 leading-relaxed flex-grow">
            {course.shortDescription}
          </p>

          <div className="flex flex-wrap gap-2 mb-5">
            <Badge variant="outline" className={`font-medium ${getDifficultyColor(course.difficulty)}`}>
              {t(`courses.difficulty.${course.difficulty.toLowerCase()}`)}
            </Badge>
            <Badge variant="secondary" className="bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-100 font-medium">
              <Clock className="w-3 h-3 mr-1 text-gray-400" aria-hidden="true" />
              {formatDuration(course.duration)}
            </Badge>
            <Badge variant="secondary" className="bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-100 font-medium">
              <Star className="w-3 h-3 mr-1 text-yellow-500 fill-yellow-500" aria-hidden="true" />
              {formatRating(course.rating)}
            </Badge>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void onStartCourse(course);
              }}
              className={`rounded-xl px-5 font-medium shadow-sm transition-all ${
                enrollmentStatus === "completed" 
                  ? "bg-gray-100 text-gray-900 hover:bg-gray-200" 
                  : "bg-gray-900 text-white hover:bg-blue-600 hover:shadow-blue-200"
              }`}
            >
              {enrollmentStatus === "completed"
                ? t("courses.reviewOnCoursera")
                : t("courses.startCourse")}
            </Button>

            <div className="flex items-center gap-1">
              {isEnrolled && enrollmentStatus !== "completed" && onMarkCompleted && (
                 <Button
                 variant="ghost"
                 size="icon"
                 onClick={(e) => {
                   e.stopPropagation();
                   void onMarkCompleted(course);
                 }}
                 className="h-9 w-9 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
                 aria-label={t("courses.markCompleted")}
               >
                 <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
               </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 text-gray-300 group-hover:text-blue-500 transition-colors rounded-full hover:bg-blue-50"
                aria-label={`View ${course.title} details`}
              >
                <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </article>
    </motion.div>
  );
}
