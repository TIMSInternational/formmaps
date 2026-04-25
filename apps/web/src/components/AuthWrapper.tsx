"use client";
import { useEffect, useState, useMemo } from "react";
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

interface AuthWrapperProps {
  children: React.ReactNode;
}

const protectedRoutes = ["/dashboard", "/subscribe", "/school-admin", "/parent", "/counselor"];
const publicOnboardingRoutes = ["/parent/onboarding", "/counselor/onboarding"];
const authRoutes = ["/login", "/signup"];

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { user, initializeAuth } = useGlobalStore();
  const router = useRouter();
  const pathname = usePathname();
  const [isInitializing, setIsInitializing] = useState(true);
  const { role, isStudent } = usePermission();

  // Monitor token expiry in background
  useTokenMonitor(5);

  // Fetch and sync permissions from backend (keeps store fresh)
  useUserPermissions({ enabled: user.isAuthenticated && !isInitializing });

  // Subscription check for students
  const isProtectedRoute = protectedRoutes.some((r) => pathname.startsWith(r));
  const isPublicOnboarding = publicOnboardingRoutes.some((p) => pathname.startsWith(p));
  const isSubscriptionPage =
    pathname.startsWith("/dashboard/subscriptions") ||
    pathname.startsWith("/dashboard/admin/plans") ||
    pathname.startsWith("/payment-success") ||
    pathname.startsWith("/payment-cancelled") ||
    pathname.startsWith("/subscribe");
  const isOnboardingPage = pathname.startsWith("/onboarding");

  const shouldCheckSubscription =
    user.isAuthenticated && isProtectedRoute && isStudent && !isSubscriptionPage && !isOnboardingPage;

  const { data: subscriptionStatus, isLoading: statusLoading } = useSubscriptionStatus({
    enabled: !!shouldCheckSubscription,
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
    if (isInitializing) return null;
    if (isPublicOnboarding) return null;

    const isAuthRoute = authRoutes.includes(pathname);

    // Unauthenticated on protected route
    if (!user.isAuthenticated && isProtectedRoute) {
      return `/login?redirect=${encodeURIComponent(pathname)}`;
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
    if (shouldCheckSubscription && !statusLoading) {
      if (!subscriptionStatus?.hasActiveSubscription) {
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

    // Authenticated on auth routes
    if (user.isAuthenticated && isAuthRoute) {
      return roleHomeMap[role] || "/dashboard";
    }

    return null;
  }, [
    isInitializing,
    isPublicOnboarding,
    user.isAuthenticated,
    user.contractEnd,
    pathname,
    role,
    isProtectedRoute,
    shouldCheckSubscription,
    statusLoading,
    subscriptionStatus,
  ]);

  // Perform the redirect in an effect
  useEffect(() => {
    if (redirectTarget) {
      router.push(redirectTarget);
    }
  }, [redirectTarget, router]);

  // Show spinner while initializing OR while waiting for a redirect
  // Use overlay approach instead of replacing children to avoid DOM reconciliation errors
  // with cookie banners and browser extensions that inject nodes
  if (isInitializing) {
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
