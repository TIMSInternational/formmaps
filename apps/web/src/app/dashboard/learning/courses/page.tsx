"use client";
import { useTranslation } from "react-i18next";
import { CoursesCatalog } from "../../../../components/dashboard/courses/CoursesCatalog";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";


export default function CoursesPage() {
  const { t } = useTranslation();

  return (
    <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh]">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-5 mb-10"
      >
        <Link
          href="/dashboard/learning"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("nav.learning")}
        </Link>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
            {t("courses.curatedCatalog", "Curated Catalog")}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
            {t("courses.exploreCourses", "Explore Courses")}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            {t("courses.discoverCourses")}
          </p>
        </div>
      </motion.div>

      {/* Courses Catalog */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <CoursesCatalog />
      </motion.div>
    </div>
  );
}
