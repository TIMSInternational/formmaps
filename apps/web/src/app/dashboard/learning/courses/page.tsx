"use client";
import { useTranslation } from "react-i18next";
import { CoursesCatalog } from "../../../../components/dashboard/courses/CoursesCatalog";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";

export default function CoursesPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto py-6">
      {/* Back link */}
      <Link
        href="/dashboard/learning"
        className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        {t("nav.learning")}
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {t("courses.exploreCourses", "Explore Courses")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-lg">
          {t("courses.discoverCourses")}
        </p>
      </motion.div>

      {/* Courses Catalog */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <CoursesCatalog />
      </motion.div>
    </div>
  );
}
