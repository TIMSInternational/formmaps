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
import { Star, BookOpen, Search, PlayCircle, TrendingUp, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      // Search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const matchesSearch =
          course.title.toLowerCase().includes(searchTerm) ||
          course.shortDescription.toLowerCase().includes(searchTerm) ||
          course.provider.toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (filters.category && filters.category.length > 0) {
        if (!filters.category.includes(course.category)) return false;
      }

      // Language filter
      if (filters.language && filters.language.length > 0) {
        if (!filters.language.includes(course.language)) return false;
      }

      // Difficulty filter
      if (filters.difficulty && filters.difficulty.length > 0) {
        if (!filters.difficulty.includes(course.difficulty)) return false;
      }

      // Country filter
      if (filters.country && filters.country.length > 0) {
        if (!filters.country.includes(course.country)) return false;
      }

      // Region filter
      if (filters.region && filters.region.length > 0) {
        if (!course.region || !filters.region.includes(course.region))
          return false;
      }

      return true;
    });

    // Sort courses
    filtered.sort((a: Course, b: Course) => {
      switch (sortBy) {
        case "recommended":
          return b.recommendedScore - a.recommendedScore;
        case "rating":
          return b.rating - a.rating;
        case "enrollment":
          return b.enrollmentCount - a.enrollmentCount;
        case "newest":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "duration":
          return a.duration - b.duration;
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return filtered;
  }, [courses, filters, sortBy]);

  // Use AI-recommended courses from /api/course/recommended
  const recommendedCourses = useMemo(() => {
    if (aiRecommendedCourses.length > 0) return aiRecommendedCourses.slice(0, 5);
    // Fallback: sort by recommendedScore if API hasn't returned yet
    return [...courses]
      .sort((a: any, b: any) => (b.recommendedScore || 0) - (a.recommendedScore || 0))
      .slice(0, 3);
  }, [aiRecommendedCourses, courses]);

  // Featured Course (highest rated or newest)
  const featuredCourse = useMemo(() => {
    if (courses.length === 0) return null;
    return courses.reduce((prev: Course, current: Course) =>
      (prev.rating > current.rating) ? prev : current
    );
  }, [courses]);

  const handleStartCourse = useCallback(
    async (course: Course) => {
      try {
        const enrollment = await enrollInCourse({
          course,
          enrollmentSource: recommendedCourses.some((c: any) => c.id === course.id || c.courseId === course.id)
            ? "recommended"
            : "catalog",
        });

        setEnrollments((prev) => ({ ...prev, [course.id]: enrollment }));

        const progress = await trackCourseProgress({
          enrollmentId: enrollment.enrollmentId,
          completedModules: 0,
          totalModules: course.syllabus.length,
          percentage: 0,
          status: "in_progress",
          lastAccessedAt: new Date().toISOString(),
        });

        if (progress) {
          setEnrollments((prev) => ({ ...prev, [course.id]: progress }));
        }

        if (course.courseraUrl) window.open(course.courseraUrl, "_blank");
      } catch (error) {
        console.error("Failed to enroll in course:", error);
        toast.error(t("courses.enrollError", "Failed to start course. Please try again."));
      }
    },
    [recommendedCourses]
  );

  const handleMarkCompleted = useCallback(
    async (course: Course) => {
      const enrollment = enrollments[course.id];
      if (!enrollment) return;

      try {
        const updated = await markCourseCompleted({
          enrollmentId: enrollment.enrollmentId,
          completedAt: new Date().toISOString(),
        });
        if (updated) {
          setEnrollments((prev) => ({
            ...prev,
            [course.id]: updated,
          }));
        }
      } catch (error) {
        console.error("Failed to mark course completed:", error);
        toast.error(t("courses.completeError", "Failed to mark course as completed. Please try again."));
      }
    },
    [enrollments]
  );

  const handleViewDetails = useCallback((course: Course) => {
    openPanel({
      title: course.title,
      content: (
        <CourseDetailPanel
          course={course}
          enrollment={enrollments[course.id]}
          onStartCourse={handleStartCourse}
          onMarkCompleted={handleMarkCompleted}
        />
      ),
    });
  }, [openPanel, enrollments, handleStartCourse, handleMarkCompleted]);

  const handleClearFilters = () => {
    setFilters({});
  };

  const handleQuickCategory = (category: string) => {
    setFilters(prev => ({
      ...prev,
      category: prev.category?.includes(category)
        ? prev.category.filter(c => c !== category)
        : [category]
    }));
  };

  const availableFilters = {
    categories: courseCategories,
    languages: courseLanguages,
    difficulties: [...courseDifficulties],
    countries: courseCountries,
    regions: courseRegions,
  };

  return (
    <div className="space-y-10">
      {/* Featured Hero Section */}
      {featuredCourse && !filters.search && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden bg-gray-900 text-white shadow-2xl"
        >
          <div className="absolute inset-0">
            <Image
              src={featuredCourse.thumbnailUrl}
              alt={featuredCourse.title}
              fill
              className="object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/80 to-transparent" />
          </div>

          <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row gap-8 items-start md:items-center">
            <div className="flex-1 space-y-6">
              <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-none px-3 py-1 text-sm font-medium rounded-full">
                <Sparkles className="w-3.5 h-3.5 mr-1.5 inline-block" />
                {t("courses.featuredCourse")}
              </Badge>

              <h2 className="text-3xl md:text-5xl font-bold leading-tight">
                {featuredCourse.title}
              </h2>

              <p className="text-gray-300 text-lg max-w-2xl leading-relaxed line-clamp-2">
                {featuredCourse.shortDescription}
              </p>

              <div className="flex flex-wrap gap-4 pt-2">
                <Button
                  size="lg"
                  onClick={() => handleStartCourse(featuredCourse)}
                  className="bg-white text-gray-900 hover:bg-gray-100 font-bold rounded-xl h-12 px-8"
                >
                  <PlayCircle className="w-5 h-5 mr-2" />
                  {t("courses.startLearningNow")}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => handleViewDetails(featuredCourse)}
                  className="border-gray-700 text-white hover:bg-white/10 hover:text-white rounded-xl h-12 px-8"
                >
                  {t("courses.viewDetails")}
                </Button>
              </div>
            </div>

            <div className="hidden md:block w-full max-w-xs bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{t("courses.rating")}</span>
                  <div className="flex items-center gap-1 text-yellow-400 font-bold">
                    <Star className="w-4 h-4 fill-current" />
                    {featuredCourse.rating.toFixed(1)}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{t("courses.duration")}</span>
                  <span className="font-medium">{featuredCourse.duration} {t("courses.weeks")}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{t("courses.level")}</span>
                  <span className="font-medium">{featuredCourse.difficulty}</span>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <BookOpen className="w-4 h-4" />
                    <span>{t("courses.providedBy", { provider: featuredCourse.provider })}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick Categories */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant={(!filters.category || filters.category.length === 0) ? "default" : "outline"}
          onClick={() => setFilters(prev => ({ ...prev, category: undefined }))}
          className={`rounded-full px-6 ${(!filters.category || filters.category.length === 0) ? "bg-gray-900" : "border-gray-200 text-gray-600"}`}
        >
          {t("courses.allTopics")}
        </Button>
        {courseCategories.slice(0, 6).map(category => (
          <Button
            key={category}
            variant={filters.category?.includes(category) ? "default" : "outline"}
            onClick={() => handleQuickCategory(category)}
            className={`rounded-full px-6 ${filters.category?.includes(category) ? "bg-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
          >
            {t(`courses.categories.${category.toLowerCase()}`)}
          </Button>
        ))}
      </div>

      {/* Active Filter Pills */}
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

      {/* Search & Filter Section */}
      <div className=" rounded-2xl py-0">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-lg">
              <Search className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">
                {t("courses.searchAndFilter")}
              </h2>
              <p className="text-sm text-gray-600">
                {t("courses.findCoursesDescription")}
              </p>
            </div>
          </div>
        </div>

        <CourseFilters
          filters={filters}
          sortBy={sortBy}
          onFiltersChange={setFilters}
          onSortChange={setSortBy}
          onClearFilters={handleClearFilters}
          availableFilters={availableFilters}
          searchCandidates={courses}
        />
      </div>

      {/* Recommended Section */}
      {!filters.search && (
        <div className="bg-white rounded-3xl p-8 border border-gray-200 relative overflow-hidden">
          <div className="flex items-center gap-4 mb-8 relative z-10">
            <div className="p-3 bg-gray-100 rounded-xl">
              <TrendingUp className="w-6 h-6 text-gray-900" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">
                {t("courses.recommendedForYou")}
              </h2>
              <p className="text-sm text-gray-600">
                {t("courses.personalizedRecommendations")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
            {recommendedCourses.map((course: any, index: number) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * index }}
              >
                <CourseCard
                  key={course.id}
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

      {/* All Courses Section */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gray-100 rounded-xl">
              <BookOpen className="w-6 h-6 text-gray-900" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">
                {t("courses.allCourses")}
              </h2>
              <p className="text-sm text-gray-600">
                {filteredAndSortedCourses.length} {t("courses.coursesAvailable", "courses available")}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCourseCard key={i} />
            ))}
          </div>
        ) : filteredAndSortedCourses.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl mt-6 border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{t("courses.noCoursesFound")}</h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              {t("courses.tryAdjustingFilters")}
            </p>
            <Button
              variant="outline"
              onClick={handleClearFilters}
              className="mt-6"
            >
              {t("courses.clearFilters")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {filteredAndSortedCourses.map((course: Course, index: number) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * index }}
              >
                <CourseCard
                  key={course.id}
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
          <div className="text-center mt-10">
            <p className="text-gray-500 text-sm">
              {t("courses.showingResults", {
                count: filteredAndSortedCourses.length,
                total: courses.length,
              })}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
