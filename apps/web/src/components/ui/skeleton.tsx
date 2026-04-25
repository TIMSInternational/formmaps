"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "motion/react";

interface SkeletonProps extends HTMLMotionProps<"div"> {
  variant?: "default" | "circle" | "text";
  active?: boolean;
}

export function Skeleton({
  className,
  variant = "default",
  active = true,
  ...props
}: SkeletonProps) {
  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={
        active
          ? {
            opacity: [0.5, 1, 0.5],
            transition: {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }
          : { opacity: 1 }
      }
      className={cn(
        "relative overflow-hidden bg-slate-200/80 dark:bg-slate-800/80",
        {
          "rounded-md": variant === "default",
          "rounded-full": variant === "circle",
          "rounded-sm h-4": variant === "text",
        },
        className
      )}
      {...props}
    >
      {/* Shimmer Effect */}
      {active && (
        <motion.div
          className="absolute inset-0 -translate-x-full"
          animate={{
            translateX: ["-100%", "100%"],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.5,
            ease: "linear",
          }}
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
          }}
        />
      )}
      <span className="sr-only">Loading...</span>
    </motion.div>
  );
}
