"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ApplicationTracker } from "@/components/kanban/ApplicationTracker";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ApplicationsPage() {
  const { t } = useTranslation("student");
  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
          {t("applications.badge")}
        </span>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
            {t("applications.title")}
          </h1>
          <Link
            href="/dashboard/applications/calendar"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white"
            style={{ background: "#065292" }}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {t("applications.deadlineCalendar")}
          </Link>
        </div>
        <p className="max-w-2xl text-base text-muted-foreground">
          {t("applications.subtitle")}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <ApplicationTracker />
      </motion.div>
    </div>
  );
}
