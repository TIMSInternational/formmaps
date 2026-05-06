"use client";
import { useCallback, useMemo, useState } from "react";
import { CourseCard } from "./CourseCard";
import { CourseFilters } from "./CourseFilters";
import { SkeletonCourseCard } from "./SkeletonCourseCard";
import { useSidePanel } from "@/components/side-panel/SidePanel";
import { CourseDetailPanel } from "@/components/side-panel/CourseDetailPanel";
import { ActiveFilterPills, type FilterPill } from "@/components/filters/ActiveFilterPills";
import {
  Course,
  CourseFilter,
  CourseSortOption,
  CourseEnrollment,
} from "@/types/course";
import {
  courseCategories,
  courseLanguages,
  courseCountries,
  courseDifficulties,
  courseRegions,
} from "@/data/courseConstants";
import { useCourseList, useRecommendedCourses } from "@/hooks/useCourseQueries";
import { useTranslation } from "react-i18next";
import {
  enrollInCourse,
  trackCourseProgress,
  markCourseCompleted,
} from "../../../services/courseService";
import { toast } from "@/hooks/useToast";
import { BookOpen, Search, TrendingUp, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";

export function CoursesCatalog() {
  const { t } = useTranslation();
  const { data, isLoading } = useCourseList();
  const { data: recData } = useRecommendedCourses();
  const courses = data?.courses || data?.Courses || [];
  const aiRecommendedCourses = recData?.courses || [];
  const [filters, setFilters] = useState<CourseFilter>({});
  const [sortBy, setSortBy] = useState<CourseSortOption>("recommended");
  const { openPanel } = useSidePanel();
  const [enrollments, setEnrollments] = useState<
    Record<string, CourseEnrollment>
  >({});

  // Filter and sort courses
  const filteredAndSortedCourses = useMemo(() => {
    const filtered = courses.filter((course: Course) => {
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const matchesSearch =
          course.title.toLowerCase().includes(searchTerm) ||
          course.shortDescription.toLowerCase().includes(searchTerm) ||
          course.provider.toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
      }
      if (filters.category?.length) {
        if (!filters.category.includes(course.category)) return false;
      }
      if (filters.language?.length) {
        if (!filters.language.includes(course.language)) return false;
      }
      if (filters.difficulty?.length) {
        if (!filters.difficulty.includes(course.difficulty)) return false;
      }
      if (filters.country?.length) {
        if (!filters.country.includes(course.country)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case "rating":
        sorted.sort((a, b) => b.rating - a.rating);
        break;
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.publishedDate).getTime() -
            new Date(a.publishedDate).getTime()
        );
        break;
      case "duration":
        sorted.sort((a, b) => a.duration - b.duration);
        break;
      case "recommended":
      default:
        break;
    }

    return sorted;
  }, [courses, filters, sortBy]);

  const recommendedCourses = useMemo(() => {
    if (aiRecommendedCourses.length > 0) return aiRecommendedCourses.slice(0, 6);
    return courses
      .filter((c: Course) => c.rating >= 4.5)
      .sort((a: Course, b: Course) => b.rating - a.rating)
      .slice(0, 6);
  }, [courses, aiRecommendedCourses]);

  const availableFilters = useMemo(
    () => ({
      categories: courseCategories,
      languages: courseLanguages,
      countries: courseCountries,
      difficulties: [...courseDifficulties] as string[],
      regions: courseRegions,
    }),
    []
  );

  const handleViewDetails = useCallback(
    (course: Course) => {
      openPanel({
        title: course.title,
        content: (
          <CourseDetailPanel
            course={course}
            onStartCourse={() => handleStartCourse(course)}
          />
        ),
      });
    },
    [openPanel, enrollments]
  );

  const handleStartCourse = useCallback(
    async (course: Course) => {
      // Open the Coursera link immediately
      if (course.courseraUrl) {
        window.open(course.courseraUrl, "_blank", "noopener,noreferrer");
      }

      // Track enrollment locally
      try {
        const result = await enrollInCourse({ course, enrollmentSource: "catalog" });
        if (result) {
          setEnrollments((prev) => ({
            ...prev,
            [course.id]: result,
          }));
        }
      } catch {
        // Enrollment tracking failed but course link already opened
      }
    },
    []
  );

  const handleMarkCompleted = useCallback(async (courseOrId: Course | string) => {
    const courseId = typeof courseOrId === "string" ? courseOrId : courseOrId.id;
    try {
      const enrollmentId = `enrollment_${courseId}`;
      await markCourseCompleted({ enrollmentId });
      setEnrollments((prev) => ({
        ...prev,
        [courseId]: { ...prev[courseId], status: "completed" },
      }));
    } catch {
      toast.error("Failed to mark course as completed");
    }
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({});
    setSortBy("recommended");
  }, []);

  const handleQuickCategory = useCallback((category: string) => {
    setFilters((prev) => {
      const current = prev.category || [];
      return {
        ...prev,
        category: current.includes(category)
          ? current.filter((c) => c !== category)
          : [...current, category],
      };
    });
  }, []);

  return (
    <div className="space-y-5">
      {/* Active filter pills */}
      {(() => {
        const pills: FilterPill[] = [];
        if (filters.search) pills.push({ key: "search", label: "Search", value: filters.search });
        if (filters.category?.length) pills.push({ key: "category", label: "Category", value: filters.category.join(", ") });
        if (filters.language?.length) pills.push({ key: "language", label: "Language", value: filters.language.join(", ") });
        if (filters.difficulty?.length) pills.push({ key: "difficulty", label: "Level", value: filters.difficulty.join(", ") });
        if (filters.country?.length) pills.push({ key: "country", label: "Country", value: filters.country.join(", ") });
        if (sortBy !== "recommended") pills.push({ key: "sortBy", label: "Sort", value: sortBy });
        return (
          <ActiveFilterPills
            pills={pills}
            onRemove={(key) => {
              if (key === "sortBy") { setSortBy("recommended"); return; }
              setFilters({ ...filters, [key]: undefined });
            }}
            onClearAll={() => { setFilters({}); setSortBy("recommended"); }}
          />
        );
      })()}

      {/* Recommended */}
      {!filters.search && recommendedCourses.length > 0 && (
        <div className="dash-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-foreground">
              {t("courses.recommendedForYou")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {recommendedCourses.length} {t("courses.coursesAvailable", "courses")}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedCourses.map((course: any, index: number) => (
              <motion.div
                key={course.id || `rec-${index}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * index }}
              >
                <CourseCard
                  course={course}
                  onViewDetails={handleViewDetails}
                  onStartCourse={handleStartCourse}
                  isRecommended={true}
                  isEnrolled={Boolean(enrollments[course.id])}
                  enrollmentStatus={enrollments[course.id]?.status}
                  onMarkCompleted={handleMarkCompleted}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* All Courses */}
      <div className="dash-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground">
              {t("courses.allCourses")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {filteredAndSortedCourses.length} {t("courses.coursesAvailable", "courses")}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCourseCard key={i} />
            ))}
          </div>
        ) : filteredAndSortedCourses.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-foreground mb-1">{t("courses.noCoursesFound")}</h3>
            <p className="text-xs text-muted-foreground mb-3">
              {t("courses.tryAdjustingFilters")}
            </p>
            <button
              onClick={handleClearFilters}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {t("courses.clearFilters")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAndSortedCourses.map((course: Course, index: number) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.03 * index }}
              >
                <CourseCard
                  course={course}
                  onViewDetails={handleViewDetails}
                  onStartCourse={handleStartCourse}
                  isRecommended={recommendedCourses.some(
                    (rc: any) => rc.id === course.id || rc.courseId === course.id
                  )}
                  isEnrolled={Boolean(enrollments[course.id])}
                  enrollmentStatus={enrollments[course.id]?.status}
                  onMarkCompleted={handleMarkCompleted}
                />
              </motion.div>
            ))}
          </div>
        )}

        {filteredAndSortedCourses.length > 0 && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            {t("courses.showingResults", {
              count: filteredAndSortedCourses.length,
              total: courses.length,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
