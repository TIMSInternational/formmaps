"use client";

/**
 * Telemetry Service
 * 
 * Privacy-compliant event tracking with batching and backend API integration.
 * All user IDs are anonymized before sending. No PII is stored in events.
 */

// Event types supported by the telemetry system
export type TelemetryEventType =
  | "page_view"
  | "click"
  | "favorite_add"
  | "favorite_remove"
  | "form_save"
  | "form_complete"
  | "session_book"
  | "session_complete"
  | "session_cancel"
  | "assessment_start"
  | "assessment_complete"
  | "resume_step_complete"
  | "login"
  | "logout"
  // Extended event types
  | "course_start"
  | "course_progress"
  | "course_complete"
  | "career_view"
  | "career_explore"
  | "coach_view"
  | "search"
  | "error"
  // formmaps#90 — Core Web Vitals (LCP/INP/CLS/TTFB/FCP), sent by lib/webVitals.ts.
  // The backend keeps its OWN allow-list and silently drops unrecognised types with a
  // 200, so this must stay in step with VALID_EVENTS in api/src/routes/telemetry.ts or
  // the events disappear without any error.
  | "web_vital";

export interface TelemetryEvent {
  type: TelemetryEventType;
  timestamp: string;
  properties?: Record<string, unknown>;
}

interface TelemetryConfig {
  apiEndpoint: string;
  batchSize: number;
  flushInterval: number; // ms
  enabled: boolean;
}

// Get API base URL from environment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

// Default configuration
const defaultConfig: TelemetryConfig = {
  apiEndpoint: `${API_BASE_URL}/api/v1/telemetry/events`,
  batchSize: 10,
  flushInterval: 5000, // 5 seconds
  enabled: true,
};

// PII fields that should never be included in telemetry.
// Entries MUST be lowercase: sanitizeProperties matches on key.toLowerCase(),
// so a camelCase entry here can never match and the field leaks through.
const PII_FIELDS = [
  "email",
  "name",
  "fullname",
  "firstname",
  "lastname",
  "phone",
  "address",
  "password",
  "token",
  "creditcard",
  "ssn",
];

class TelemetryService {
  private config: TelemetryConfig;
  private eventQueue: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;
  private disabledForSession = false;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Initialize the telemetry service
   * Sets up automatic flushing and page unload handlers
   */
  init(): void {
    if (this.isInitialized || typeof window === "undefined") return;

    this.isInitialized = true;
    this.disabledForSession = false;

    // Set up periodic flush
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);

    // Flush on page unload
    window.addEventListener("beforeunload", () => {
      this.flush(true);
    });

    // Flush on visibility change (tab hidden)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.flush(true);
      }
    });

    // Set up global error handler
    window.addEventListener("error", (event) => {
      this.trackError(
        event.message,
        event.filename,
        event.lineno,
        event.colno,
        event.error?.stack
      );
    });

    // Set up unhandled promise rejection handler
    window.addEventListener("unhandledrejection", (event) => {
      this.trackError(
        `Unhandled Promise Rejection: ${event.reason}`,
        undefined,
        undefined,
        undefined,
        event.reason?.stack
      );
    });
  }

  /**
   * Stop the telemetry service
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.isInitialized = false;
  }

  /**
   * Strip PII fields from properties object
   */
  private sanitizeProperties(
    properties?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!properties) return undefined;

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip PII fields
      if (PII_FIELDS.includes(key.toLowerCase())) {
        continue;
      }

      // Recursively sanitize nested objects
      if (value && typeof value === "object" && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeProperties(
          value as Record<string, unknown>
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private getStoredAccessToken(): string | null {
    if (typeof window === "undefined") return null;

    try {
      const stored = localStorage.getItem("timcare-global-store");
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return parsed?.state?.user?.accessToken || null;
    } catch {
      return null;
    }
  }

  private hasAuthSignal(): boolean {
    if (typeof window === "undefined") return false;
    return document.cookie.includes("logged_in=true") || !!this.getStoredAccessToken();
  }

  private requestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = this.getStoredAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  /**
   * Track a single event
   */
  track(type: TelemetryEventType, properties?: Record<string, unknown>): void {
    if (!this.config.enabled || this.disabledForSession || !this.hasAuthSignal()) return;

    const event: TelemetryEvent = {
      type,
      timestamp: new Date().toISOString(),
      properties: this.sanitizeProperties(properties),
    };

    this.eventQueue.push(event);

    // Auto-flush if batch size reached
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Track a page view
   */
  trackPageView(page: string, referrer?: string): void {
    this.track("page_view", { page, referrer });
  }

  /**
   * Track a click event
   */
  trackClick(
    elementId: string,
    elementType?: string,
    page?: string
  ): void {
    this.track("click", { elementId, elementType, page });
  }

  /**
   * Track favorite add/remove
   */
  trackFavorite(
    action: "add" | "remove",
    itemId: string,
    itemType: string
  ): void {
    this.track(action === "add" ? "favorite_add" : "favorite_remove", {
      itemId,
      itemType,
    });
  }

  /**
   * Track form events
   */
  trackForm(
    action: "save" | "complete",
    formId: string,
    page?: string,
    duration?: number
  ): void {
    this.track(action === "save" ? "form_save" : "form_complete", {
      formId,
      page,
      duration,
    });
  }

  /**
   * Track session events (coaching sessions)
   */
  trackSession(
    action: "book" | "complete" | "cancel",
    sessionId?: string,
    coachId?: string,
    topic?: string,
    rating?: number,
    reason?: string
  ): void {
    const eventMap = {
      book: "session_book",
      complete: "session_complete",
      cancel: "session_cancel",
    } as const;

    this.track(eventMap[action], {
      sessionId,
      coachId,
      topic,
      rating,
      reason,
    });
  }

  /**
   * Track assessment events
   */
  trackAssessment(
    action: "start" | "complete",
    assessmentType: string,
    score?: number,
    duration?: number
  ): void {
    this.track(action === "start" ? "assessment_start" : "assessment_complete", {
      assessmentType,
      score,
      duration,
    });
  }

  /**
   * Track resume builder step completion
   */
  trackResumeStep(step: number, stepName: string): void {
    this.track("resume_step_complete", { step, stepName });
  }

  /**
   * Track auth events
   */
  trackAuth(action: "login" | "logout", method?: string): void {
    this.track(action, { method });
  }

  // ============================================
  // EXTENDED TRACKING METHODS
  // ============================================

  /**
   * Track course progress events
   */
  trackCourse(
    action: "start" | "progress" | "complete",
    courseId: string,
    courseName?: string,
    progress?: number,
    moduleId?: string,
    duration?: number
  ): void {
    const eventMap = {
      start: "course_start",
      progress: "course_progress",
      complete: "course_complete",
    } as const;

    this.track(eventMap[action], {
      courseId,
      courseName,
      progress,
      moduleId,
      duration,
    });
  }

  /**
   * Track career path exploration
   */
  trackCareer(
    action: "view" | "explore",
    careerId: string,
    careerTitle?: string,
    source?: string
  ): void {
    this.track(action === "view" ? "career_view" : "career_explore", {
      careerId,
      careerTitle,
      source,
    });
  }

  /**
   * Track coach profile views
   */
  trackCoachView(
    coachId: string,
    coachName?: string,
    source?: string
  ): void {
    this.track("coach_view", {
      coachId,
      coachName,
      source,
    });
  }

  /**
   * Track search queries
   */
  trackSearch(
    query: string,
    category?: string,
    resultsCount?: number,
    page?: string
  ): void {
    // Only track search terms that aren't too short/empty
    if (!query || query.length < 2) return;

    this.track("search", {
      query: query.slice(0, 100), // Limit query length
      category,
      resultsCount,
      page,
    });
  }

  /**
   * Track errors (auto-captured and manual)
   */
  trackError(
    message: string,
    source?: string,
    line?: number,
    column?: number,
    stack?: string
  ): void {
    this.track("error", {
      message: message?.slice(0, 500), // Limit message length
      source,
      line,
      column,
      stack: stack?.slice(0, 1000), // Limit stack trace length
    });
  }

  /**
   * Flush events to the backend
   */
  async flush(sync = false): Promise<void> {
    if (this.eventQueue.length === 0) return;
    if (!this.hasAuthSignal()) {
      this.eventQueue = [];
      return;
    }

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const response = await fetch(this.config.apiEndpoint, {
        method: "POST",
        headers: this.requestHeaders(),
        credentials: "include",
        body: JSON.stringify({ events: eventsToSend }),
        keepalive: sync,
      });

      if (response.status === 401 || response.status === 403) {
        this.disabledForSession = true;
        this.eventQueue = [];
        return;
      }

      if (!response.ok) {
        throw new Error(`Telemetry request failed: ${response.status}`);
      }
    } catch (error) {
      // On failure, add events back to queue for retry
      // For other errors, keep events for retry (up to a limit)
      if (this.eventQueue.length < 100) {
        this.eventQueue = [...eventsToSend, ...this.eventQueue];
      } else {
        this.eventQueue = []; // Clear if too many
      }
    }
  }

  /**
   * Get queue size (for testing/debugging)
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * Clear the event queue
   */
  clearQueue(): void {
    this.eventQueue = [];
  }
}

// Export singleton instance
export const telemetry = new TelemetryService();

// IMPORTANT: Do NOT auto-initialize here!
// Telemetry must only be initialized AFTER user consent is granted.
// The TelemetryProvider component handles this after checking consent.

// Export class for testing
export { TelemetryService };
