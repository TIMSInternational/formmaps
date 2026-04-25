"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonCourseCard() {
  return (
    <div className="group relative flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
      {/* Thumbnail */}
      <div className="relative h-48 w-full overflow-hidden">
        <Skeleton className="h-full w-full" />
      </div>

      <div className="flex flex-col flex-grow p-5 space-y-4">
        {/* Header - Rating/Badge */}
        <div className="flex justify-between items-start">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>

        {/* Title & Description */}
        <div className="space-y-2 flex-grow">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 py-2 border-t border-gray-50 mt-auto">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between gap-3">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
