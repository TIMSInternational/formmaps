/**
 * API Response Utilities
 * Standardized response formatting for all AI generation endpoints
 */

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  metadata?: {
    generatedAt: string;
    model: string;
    tokensUsed: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

/**
 * Create a successful response
 */
export function successResponse<T>(
  data: T,
  metadata?: { generatedAt?: string; model?: string; tokensUsed?: number }
): SuccessResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      generatedAt: metadata?.generatedAt || new Date().toISOString(),
      model: metadata?.model || "gpt-4o-mini",
      tokensUsed: metadata?.tokensUsed || 0,
    },
  };
}

/**
 * Create an error response
 */
export function errorResponse(
  code: string,
  message: string,
  details?: Record<string, any>
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

/**
 * Validate required fields in request body
 */
export function validateRequiredFields(
  body: any,
  requiredFields: string[]
): { valid: boolean; missingFields: string[] } {
  const missingFields = requiredFields.filter(
    (field) =>
      !body ||
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ""
  );

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Validate enum values
 */
export function validateEnum(
  value: any,
  allowedValues: string[],
  fieldName: string
): { valid: boolean; error?: string } {
  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      error: `Invalid ${fieldName}. Allowed values: ${allowedValues.join(
        ", "
      )}`,
    };
  }
  return { valid: true };
}

/**
 * Sanitize text input
 */
export function sanitizeInput(text: string, maxLength: number = 10000): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  return text
    .trim()
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, ""); // Remove control characters
}

/**
 * Validate array of strings
 */
export function validateStringArray(
  arr: any,
  fieldName: string,
  minLength: number = 1,
  maxLength: number = 100
): { valid: boolean; error?: string; data?: string[] } {
  if (!Array.isArray(arr)) {
    return {
      valid: false,
      error: `${fieldName} must be an array`,
    };
  }

  if (arr.length < minLength) {
    return {
      valid: false,
      error: `${fieldName} must have at least ${minLength} item(s)`,
    };
  }

  const sanitized = arr
    .map((item) => sanitizeInput(String(item), maxLength))
    .filter((item) => item.length > 0);

  return {
    valid: true,
    data: sanitized,
  };
}

/**
 * Validate numeric range
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): { valid: boolean; error?: string } {
  if (typeof value !== "number" || isNaN(value)) {
    return {
      valid: false,
      error: `${fieldName} must be a number`,
    };
  }

  if (value < min || value > max) {
    return {
      valid: false,
      error: `${fieldName} must be between ${min} and ${max}`,
    };
  }

  return { valid: true };
}

/**
 * Format ATS score for response
 */
export function formatATSScore(score: number): {
  score: number;
  percentage: number;
  rating: "Excellent" | "Good" | "Fair" | "Poor";
} {
  const normalized = Math.max(0, Math.min(1, score));
  const percentage = Math.round(normalized * 100);

  let rating: "Excellent" | "Good" | "Fair" | "Poor" = "Poor";
  if (normalized >= 0.9) rating = "Excellent";
  else if (normalized >= 0.75) rating = "Good";
  else if (normalized >= 0.5) rating = "Fair";

  return {
    score: normalized,
    percentage,
    rating,
  };
}

/**
 * Check user rate limit
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number = 10,
  windowMs: number = 60000 // 1 minute
): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  // This would typically use Redis or a database
  // For now, return a simple implementation
  const key = `ratelimit:${userId}:${endpoint}`;

  // In production, this would check against a cache/database
  // For MVP, we'll allow all requests
  return {
    allowed: true,
    remaining: limit,
    resetTime: new Date(Date.now() + windowMs),
  };
}

/**
 * Check monthly usage quota
 */
export async function checkMonthlyQuota(
  userId: string,
  quotaLimit: number = 100
): Promise<{ allowed: boolean; used: number; limit: number; resetDate: Date }> {
  // This would typically use a database
  // For now, return a simple implementation
  const currentMonth = new Date();
  const resetDate = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    1
  );

  // In production, this would check against a database
  // For MVP, we'll allow all requests
  return {
    allowed: true,
    used: 0,
    limit: quotaLimit,
    resetDate,
  };
}

/**
 * Log generation event for analytics
 */
export async function logGenerationEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  // Log to analytics/database
  console.log(`[Analytics] ${userId} - ${eventType}`, metadata);

  // In production, send to analytics service
  try {
    // Could send to Mixpanel, Segment, etc.
  } catch (error) {
    console.error("Failed to log generation event:", error);
  }
}
