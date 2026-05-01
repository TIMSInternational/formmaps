"use client";

import { motion } from "motion/react";
import { ApplicationTracker } from "@/components/kanban/ApplicationTracker";
import { Kanban } from "lucide-react";

export default function ApplicationsPage() {
  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
          Application Tracker
        </span>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
          Track Your Applications
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Organize your university applications from research to acceptance.
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
