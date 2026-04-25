"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Hook for prefetching routes on hover
 * Use this to improve perceived navigation speed
 *
 * @example
 * const { prefetch, prefetchProps } = usePrefetch("/dashboard/career/market");
 *
 * // Option 1: Use prefetchProps spread
 * <Link href="/dashboard/career/market" {...prefetchProps}>Market</Link>
 *
 * // Option 2: Use prefetch callback manually
 * <div onMouseEnter={prefetch}>Hover me</div>
 */
export function usePrefetch(href: string) {
  const router = useRouter();

  const prefetch = useCallback(() => {
    router.prefetch(href);
  }, [router, href]);

  return {
    prefetch,
    prefetchProps: {
      onMouseEnter: prefetch,
      onFocus: prefetch,
    },
  };
}

/**
 * Hook for prefetching multiple routes
 *
 * @example
 * const { prefetchRoute } = useMultiPrefetch();
 * <Link href="/market" onMouseEnter={() => prefetchRoute("/market")}>Market</Link>
 */
export function useMultiPrefetch() {
  const router = useRouter();

  const prefetchRoute = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router]
  );

  return { prefetchRoute };
}
