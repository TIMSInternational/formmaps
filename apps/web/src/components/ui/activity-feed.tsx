"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

type IconType = React.ElementType;

export interface ActivityItem {
  id: string;
  icon: IconType;
  message: React.ReactNode;
  timestamp: string;
  iconColorClass?: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  title?: string;
  className?: string;
}

export function ActivityFeed({ activities, title = "Recent Activity", className }: ActivityFeedProps) {
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: "easeIn" as const } },
  };

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div>
        {activities.length === 0 ? (
          <div className="p-5 text-center text-muted-foreground text-xs">No recent activity.</div>
        ) : (
          <motion.div layout className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {activities.map((activity) => (
                <motion.div
                  key={activity.id}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                  className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors duration-200"
                >
                  <div className={cn("flex-shrink-0 p-1.5 rounded-full", activity.iconColorClass || "text-muted-foreground bg-muted")}>
                    <activity.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-grow flex flex-col">
                    <p className="text-xs font-medium text-foreground leading-tight">{activity.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{activity.timestamp}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
