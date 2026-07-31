"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { motion } from "motion/react";
import { BookMarked, Award, ArrowRight } from "lucide-react";

export default function LearningPage() {
  const { t } = useTranslation();

  const sections = [
    {
      title: t("dashboard.courses", "Courses"),
      description: t(
        "learning.coursesDescription",
        "Explore recommended courses aligned with your career interests"
      ),
      href: "/dashboard/learning/courses",
      icon: BookMarked,
    },
    {
      title: t("dashboard.certifications", "Certifications"),
      description: t(
        "learning.certificationsDescription",
        "Track your enrolled courses, progress, and earned certifications"
      ),
      href: "/dashboard/learning/certifications",
      icon: Award,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {t("nav.learning", "Learning")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "learning.subtitle",
            "Develop skills and earn certifications to advance your career path"
          )}
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section, i) => (
          <motion.div
            key={section.href}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link
              href={section.href}
              className="group block rounded-xl border bg-card p-6 hover:shadow-md transition-all hover:border-primary/30"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <section.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {section.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {section.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors mt-1 shrink-0" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
