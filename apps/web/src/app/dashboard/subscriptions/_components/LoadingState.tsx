"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  className?: string;
}

export function LoadingState({ className }: LoadingStateProps) {
  return (
    <div className={cn("space-y-8", className)}>
      {/* Header Skeleton */}
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Billing Toggle Skeleton */}
      <div className="flex justify-center">
        <Skeleton className="h-12 w-48 rounded-lg" />
      </div>

      {/* Plans Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-7xl mx-auto">
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            className="bg-white rounded-2xl border-2 border-gray-100 p-6 md:p-8 shadow-sm flex flex-col gap-6"
          >
            {/* Icon */}
            <Skeleton className="w-16 h-16 rounded-2xl mx-auto" />

            {/* Title & Description */}
            <div className="space-y-2 flex flex-col items-center">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>

            {/* Price */}
            <Skeleton className="h-12 w-40 mx-auto" />

            {/* Features */}
            <div className="space-y-3 w-full">
              {[1, 2, 3, 4, 5].map((featureIndex) => (
                <div key={featureIndex} className="flex items-center gap-3">
                  <Skeleton className="w-5 h-5 rounded-full" variant="circle" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>

            {/* Button */}
            <Skeleton className="h-12 w-full rounded-xl mt-auto" />
          </div>
        ))}
      </div>

      {/* Features Comparison Skeleton */}
      <div className="mt-12 md:mt-16 max-w-7xl mx-auto space-y-8">
        <Skeleton className="h-8 w-64 mx-auto" />
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm p-6 space-y-6">
          <div className="flex justify-between gap-4 border-b border-gray-50 pb-4">
            <Skeleton className="h-6 w-1/4" />
            <div className="flex gap-4 flex-1 justify-end">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between gap-4 items-center">
              <Skeleton className="h-4 w-1/3" />
              <div className="flex gap-12 flex-1 justify-end px-4">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Error state component (kept as is or could be refactored too, but mostly fine for now)
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  message = "Failed to load subscription plans",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("text-center py-12", className)}>
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-8 h-8 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Something went wrong
      </h3>
      <p className="text-gray-600 mb-6">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
