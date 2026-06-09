"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import { LoadingSpinner } from "./LoadingSpinner";
import { useSubscriptionStatus } from "@/hooks/useSubscription";
import { useTokenMonitor } from "@/hooks/useTokenMonitor";
import { usePermission } from "@/hooks/usePermission";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { Roles } from "@/lib/permissions";
import { roleHomeMap } from "@/lib/roleUtils";
import { findRouteRule, resolveRedirect } from "@/lib/routePermissions";
import { initSentry } from "@/lib/sentry";
import { toast } from "sonner";

interface AuthWrapperProps {
  children: React.ReactNode;
}

const protectedRoutes = ["/dashboard", "/admin", "/subscribe", "/school-admin", "/parent", "/counselor"];
const publicOnboardingRoutes = ["/parent/onboarding", "/counselor/onboarding"];
const authRoutes = ["/login", "/signup"];

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { user, initializeAuth } = useGlobalStore();
  const router = useRouter();
  const pathname = usePathname();
  const [isInitializing, setIsInitializing] = useState(true);
  const { role, isStudent } = usePermission();

  // Initialize Sentry error tracking (no-op if NEXT_PUBLIC_SENTRY_DSN is not set)
  useEffect(() => { initSentry(); }, []);

  // Wait for zustand persist hydration before making routing decisions
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    // zustand persist stores data synchronously in onRehydrateStorage,
    // but the state update is async. Check if the store has a persisted user.
    const unsub = useGlobalStore.persist.onFinishHydration(() => setHasHydrated(true));
    // If already hydrated (hot reload), set immediately
    if (useGlobalStore.persist.hasHydrated()) setHasHydrated(true);
    return unsub;
  }, []);

  // Monitor token expiry in background
  useTokenMonitor(5);

  // Listen for token expiry warning and show toast
  useEffect(() => {
    const handler = (e: Event) => {
      const mins = (e as CustomEvent).detail?.minutesRemaining;
      toast.warning(`Your session expires in ${mins} minute${mins === 1 ? "" : "s"}. Save your work.`);
    };
    window.addEventListener("tokenExpiryWarning", handler);
    return () => window.removeEventListener("tokenExpiryWarning", handler);
  }, []);

  // Fetch and sync permissions from backend (keeps store fresh)
  useUserPermissions({ enabled: user.isAuthenticated && !isInitializing });

  // Subscription check for students
  const isProtectedRoute = protectedRoutes.some((r) => pathname.startsWith(r));
  const isPublicOnboarding = publicOnboardingRoutes.some((p) => pathname.startsWith(p));
  const isSubscriptionPage =
    pathname.startsWith("/dashboard/subscriptions") ||
    pathname.startsWith("/admin/plans") ||
    pathname.startsWith("/payment-success") ||
    pathname.startsWith("/payment-cancelled") ||
    pathname.startsWith("/subscribe");
  const isOnboardingPage = pathname.startsWith("/onboarding");

  // School students don't need subscriptions — their school pays
  const isSchoolStudent = isStudent && !!user.schoolId;
  const shouldCheckSubscription =
    user.isAuthenticated && isProtectedRoute && isStudent && !isSchoolStudent && !isSubscriptionPage && !isOnboardingPage;

  const { data: subscriptionStatus, isLoading: statusLoading, isError: statusError, isFetching: statusFetching } = useSubscriptionStatus({
    enabled: !!shouldCheckSubscription,
    retry: 2,
    staleTime: 30 * 1000, // 30s — short enough to catch post-payment changes quickly
  });

  useEffect(() => {
    const initialize = async () => {
      await initializeAuth();
      setIsInitializing(false);
    };
    initialize();
  }, [initializeAuth]);

  // Compute redirect target synchronously — if non-null, we show spinner instead of children
  const redirectTarget = useMemo(() => {
    if (isInitializing || !hasHydrated) return null;
    if (isPublicOnboarding) return null;

    const isAuthRoute = authRoutes.includes(pathname);

    // Unauthenticated on protected route — keep the query string so deep
    // links like /dashboard/courses?tab=plan survive the login round-trip
    if (!user.isAuthenticated && isProtectedRoute) {
      const search = typeof window !== "undefined" ? window.location.search : "";
      return `/login?redirect=${encodeURIComponent(pathname + search)}`;
    }

    // Route-rule based access control
    if (user.isAuthenticated && isProtectedRoute) {
      const rule = findRouteRule(pathname);
      if (rule && !rule.allowed.includes(role)) {
        const target = resolveRedirect(rule, role);
        if (target !== pathname && !pathname.startsWith(target)) {
          return target;
        }
      }
    }

    // Subscription enforcement for students
    if (
      shouldCheckSubscription &&
      !statusLoading &&
      !statusFetching &&
      !statusError &&
      subscriptionStatus !== undefined
    ) {
      if (!subscriptionStatus.hasActiveSubscription) {
        return "/subscribe";
      }
    }

    // Coach contract expiry
    if (pathname.startsWith("/dashboard/coaching") && role === Roles.COACH && user.contractEnd) {
      const contractEndDate = new Date(user.contractEnd);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (contractEndDate < today && pathname !== "/dashboard/coaching/access-denied") {
        return "/dashboard/coaching/access-denied";
      }
    }

    // Authenticated on auth routes — redirect to their portal.
    if (user.isAuthenticated && isAuthRoute) {
      const home = roleHomeMap[role];
      if (home) return home;
    }

    return null;
  }, [
    isInitializing,
    hasHydrated,
    isPublicOnboarding,
    user.isAuthenticated,
    user.contractEnd,
    pathname,
    role,
    isProtectedRoute,
    shouldCheckSubscription,
    statusLoading,
    statusFetching,
    statusError,
    subscriptionStatus,
  ]);

  // Perform the redirect in an effect — track last target to prevent loops
  const lastRedirectRef = useRef<string | null>(null);
  useEffect(() => {
    if (redirectTarget) {
      // Prevent infinite loop: don't re-push if we already redirected to this target
      // or if the target is a child of the current path (navigation in progress)
      if (lastRedirectRef.current === redirectTarget) return;
      lastRedirectRef.current = redirectTarget;
      router.replace(redirectTarget);
    } else {
      lastRedirectRef.current = null;
    }
  }, [redirectTarget, router]);

  // Show spinner while initializing OR while waiting for a redirect
  // Use overlay approach instead of replacing children to avoid DOM reconciliation errors
  // with cookie banners and browser extensions that inject nodes
  if (isInitializing || !hasHydrated) {
    return <LoadingSpinner />;
  }

  return (
    <>
      {redirectTarget && (
        <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          </div>
        </div>
      )}
      {children}
    </>
  );
}
