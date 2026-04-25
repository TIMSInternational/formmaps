"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton loader for chart components
 */
export function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`p-4 border rounded-xl space-y-4 ${className}`}>
      <Skeleton className="h-4 w-24" />
      <div className="flex items-end gap-2 h-32">
        {[40, 60, 30, 80, 50, 70, 45].map((h, i) => (
          <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
      <span className="sr-only">Loading chart data...</span>
    </div>
  );
}

/**
 * Skeleton loader for PDF/document components
 */
export function DocumentSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      <Skeleton className="h-8 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <Skeleton className="h-40 w-full" />
      <span className="sr-only">Loading document...</span>
    </div>
  );
}

/**
 * Skeleton loader for modal content
 */
export function ModalSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-6 p-6 ${className}`}>
      <Skeleton className="h-6 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex gap-3 justify-end">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-24" />
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * Skeleton loader for cards
 */
export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`p-6 bg-white rounded-2xl border border-slate-100 space-y-4 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <span className="sr-only">Loading card content...</span>
    </div>
  );
}

/**
 * Full page loading state
 */
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-96" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CardSkeleton className="md:col-span-2" />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton className="md:col-span-2" />
        </div>
      </div>
      <span className="sr-only">Loading page content...</span>
    </div>
  );
}

