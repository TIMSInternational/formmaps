import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Define protected API routes that require authentication
const protectedApiRoutes = [
  "/api/admin",
  "/api/v1/assessments/me/timeline",
  "/api/v1/assessments/me/timeline/stats",
  "/api/v1/assessments/me/timeline/export",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only check authentication for protected API routes
  if (pathname.startsWith("/api/")) {
    const isProtectedApiRoute = protectedApiRoutes.some((route) =>
      pathname.startsWith(route)
    );

    if (isProtectedApiRoute) {
      // Get token from authorization header
      const authHeader = request.headers.get("authorization");

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
    }
  }

  // Allow all other requests to pass through
  // Page authentication redirects are handled client-side by AuthWrapper
  // Server-side subscription gating for dashboard pages (students must subscribe)
  // Skip API routes (handled above) and subscription/payment pages to avoid loops
  if (pathname.startsWith("/dashboard")) {
    const skipPaths = [
      "/dashboard/subscriptions",
      "/dashboard/admin/plans",
      "/payment-success",
      "/payment-cancelled",
      "/onboarding",
    ];

    const shouldSkip = skipPaths.some((p) => pathname.startsWith(p));
    if (!shouldSkip) {
      // Check if user is logged in via cookie
      const authHeader = request.headers.get("authorization");
      let token = null;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7);
      } else {
        // Backend sets httpOnly "access_token" cookie — middleware can't read it
        // Use the non-httpOnly "logged_in" cookie as auth signal instead
        const loggedIn = request.cookies.get("logged_in");
        const accessToken = request.cookies.get("access_token");
        if (loggedIn?.value === "true" || accessToken) token = "cookie-auth";
      }

      if (token) {
        try {
          // Forward cookies to API for server-side auth check
          const cookieHeader = request.headers.get("cookie") || "";
          const profileRes = fetch(
            `${process.env.NEXT_PUBLIC_API_BASE_URL}/authapi/profile`,
            {
              headers: { Cookie: cookieHeader },
            }
          );

          // Note: fetch returns a Promise;await it
          return profileRes
            .then((res) => {
              if (!res.ok) return NextResponse.next();
              return res.json();
            })
            .then((user) => {
              if (!user) return NextResponse.next();

              const role = (user.role || user.roleName || "").toLowerCase();
              const isStudent =
                !role || role === "student" || role === "user" || (!role.includes("admin") && !role.includes("coach"));

              const sub = user.subscriptionStatus;
              const hasActiveSub = sub && sub !== "none" && sub !== "canceled" && sub !== "past_due";

              if (isStudent && !hasActiveSub) {
                const url = request.nextUrl.clone();
                url.pathname = "/subscribe";
                return NextResponse.redirect(url);
              }

              return NextResponse.next();
            })
            .catch(() => NextResponse.next());
        } catch (e) {
          return NextResponse.next();
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
