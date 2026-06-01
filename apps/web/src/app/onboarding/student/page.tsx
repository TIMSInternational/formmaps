"use client";

import { useSearchParams, redirect } from "next/navigation";

/**
 * Handles /onboarding/student?token=xxx by redirecting to /onboarding/student/[token]
 * This supports the new secure token-based onboarding URLs while keeping
 * the existing [token] dynamic route page intact.
 */
export default function StudentOnboardingRedirect() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (!token) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1d1d1d", color: "#818181", fontFamily: "Inter, system-ui, sans-serif" }}>
        <p>Invalid onboarding link. Please check your email for the correct link.</p>
      </div>
    );
  }

  redirect(`/onboarding/student/${token}`);
}
