/**
 * Environment variable validation.
 * Warns at startup if required vars are missing.
 */

const requiredEnvVars = [
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
