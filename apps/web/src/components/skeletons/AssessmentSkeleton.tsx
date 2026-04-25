"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";

export function AssessmentSkeleton() {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-0 h-full flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="p-8 pb-4 flex items-start justify-between">
        <div className="space-y-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-20 w-20 rounded-full" variant="circle" />
      </div>

      {/* Timeline */}
      <div className="flex-1 relative px-4 py-6 md:px-8 space-y-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            {/* Left/Right content mimic */}
            <div className={`hidden md:block flex-1 ${i % 2 === 0 ? "order-1" : "order-3"}`}>
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>

            {/* Center Node */}
            <div className="order-2 relative z-10 flex min-w-12 justify-center">
              <Skeleton className="h-12 w-12 rotate-45 rounded-xl border-4 border-white shadow-sm" />
            </div>

            {/* Right/Left content mimic */}
            <div className={`flex-1 ${i % 2 === 0 ? "order-3" : "order-1"}`}>
              <div className="md:hidden">
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-gray-50">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
