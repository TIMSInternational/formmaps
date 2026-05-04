/**
 * Environment variable validation.
 * Call validateEnv() at app startup to fail fast if required vars are missing.
 */

const requiredEnvVars = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
  "NEXT_PUBLIC_COGNITO_CLIENT_ID",
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((v) => `  - ${v}`).join("\n")}\n\nCheck your .env.local file.`
    );
  }
}
