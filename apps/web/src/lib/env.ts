/**
 * Environment variable validation.
 * Warns at startup if required vars are missing.
 */

const requiredEnvVars = [
  // ⚠ Must stay UNSET in prod (Vercel): the app uses relative paths through the
  // next.config.ts same-origin proxy, and auth cookies are SameSite=lax — setting
  // this to the App Runner URL makes calls cross-site, where lax cookies are
  // dropped and login breaks with a 401 loop.
  "NEXT_PUBLIC_API_BASE_URL",
] as const;

export function validateEnv(): void {
  if (typeof window !== "undefined") return; // Only validate on server/build

  const missing: string[] = [];
  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `[formmaps] Missing environment variables: ${missing.join(", ")}. Some features may not work.`
    );
  }
}
