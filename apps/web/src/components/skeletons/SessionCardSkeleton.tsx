import { Skeleton } from "@/components/ui/skeleton";

export function SessionCardSkeleton() {
  return (
    <div className="relative bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-sm overflow-hidden">
      {/* Left Accent Gradient Placeholder */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-200" />

      <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center pl-2">
        {/* Student Info */}
        <div className="flex items-center gap-5 flex-1 w-full lg:w-auto">
          <div className="relative">
            <Skeleton className="h-16 w-16 rounded-full border-4 border-white" variant="circle" />
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-24 rounded-md" />
            </div>
          </div>
        </div>

        {/* Divider Desktop */}
        <div className="hidden lg:block w-px h-16 bg-gray-200" />

        {/* Session Details */}
        <div className="flex flex-row lg:flex-col gap-6 lg:gap-1.5 w-full lg:w-56 justify-between lg:justify-center">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" variant="circle" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="flex items-center gap-2.5 pl-1">
            <Skeleton className="h-4 w-4" variant="circle" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Divider Desktop */}
        <div className="hidden lg:block w-px h-16 bg-gray-200" />

        {/* Actions */}
        <div className="flex items-center justify-end w-full lg:w-auto gap-3">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
