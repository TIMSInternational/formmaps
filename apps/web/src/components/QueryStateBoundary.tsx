"use client";
import { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface QueryStateBoundaryProps {
  isLoading: boolean;
  isError: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
  emptyFallback?: ReactNode;
  children: ReactNode;
}

// Single source of truth for the loading/error/empty distinction across every
// student page. Strict precedence loading → error → empty → children ensures a
// failed fetch is NEVER rendered as "no data".
export function QueryStateBoundary({
  isLoading, isError, isEmpty = false, onRetry,
  loadingFallback, errorFallback, emptyFallback, children,
}: QueryStateBoundaryProps) {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        {loadingFallback ?? (<><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></>)}
      </div>
    );
  }
  if (isError) {
    if (errorFallback) return <>{errorFallback}</>;
    return (
      <div role="alert" className="dash-card p-12 text-center" style={{ background: "var(--admin-bg-card)" }}>
        <div className="w-14 h-14 mx-auto mb-4 bg-red-50 rounded-xl border border-red-100 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-[#dc2626]" />
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1">Something went wrong</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">We couldn&apos;t load this data. This is a temporary problem, not an empty record.</p>
        {onRetry && (<Button onClick={onRetry} className="bg-[#065292] text-white hover:bg-[#065292]/90"><RefreshCw className="h-4 w-4 mr-2" />Try again</Button>)}
      </div>
    );
  }
  if (isEmpty) return <>{emptyFallback ?? null}</>;
  return <>{children}</>;
}
export default QueryStateBoundary;
