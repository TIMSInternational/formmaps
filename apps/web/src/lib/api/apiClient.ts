import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { toast } from '@/hooks/useToast';
// The bare i18next singleton (initialised by @/lib/i18n at app start). Importing @/lib/i18n here
// would pull react-i18next into every module that talks to the API, including tests that mock it.
import i18n from 'i18next';
import { refreshAccessToken, isLoggedIn } from '@/services/tokenRefreshService';
import { forceLogout } from '@/utils/tokenUtils';
import { ACTING_SCHOOL_HEADER, actingSchoolHeaderFor } from '@/lib/actingSchool';
import { normalizeRole } from '@/lib/roleUtils';
import { Roles } from '@/lib/permissions';
import { ASSESSMENT_AREAS, COMPLETE_PURCHASE_ROUTE } from '@/lib/independentStudent';

export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

export function unwrapApiData<T>(response: ApiEnvelope<T> | T): T {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as ApiEnvelope<T>).data as T;
  }
  return response as T;
}

// Create an Axios instance with base URL and default headers
export const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  withCredentials: true, // Send httpOnly cookies with every request
});

// audit 2026-10-09 C18 — student paywall (INDEPENDENT_STUDENT_PAYWALL). Both backends answer a gated
// request with 402 { success: false, message, code } (Node middleware/studentPaywall.ts ≡ .NET
// StudentPaywallPolicy / StudentPaywallFilter), code ∈ PAYMENT_REQUIRED | FULL_PLATFORM_REQUIRED |
// PAID_RESULTS_REQUIRED. Before this the web treated a 402 like any other 4xx, so results pages rendered
// "you have not completed this assessment" and sent the student back to a test they had finished (loop).
export const PAID_RESULTS_REQUIRED_CODE = 'PAID_RESULTS_REQUIRED';

/** True for a paywall 402 — results pages render the "unlock your results" state for it. */
export function isPaymentRequiredError(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 402;
}

// Pages where a 402 must never navigate: the purchase flow itself (no redirect loop), auth, and the
// assessment areas, which are open to every student (D4) — a background widget there that hits a gated
// endpoint must not eject a student from the test they are taking.
const PAYWALL_REDIRECT_EXEMPT = [
  COMPLETE_PURCHASE_ROUTE, '/subscribe', '/payment-success', '/payment-cancelled', '/login', '/signup',
  ...ASSESSMENT_AREAS,
];

/**
 * Where a 402 sends the browser, or null to stay. PAID_RESULTS_REQUIRED never navigates: results endpoints
 * are also read by pages that are open to unpaid students (assessments hub progress, dashboard widgets), and
 * /complete-purchase bounces a trialing student (full platform, no paid results) straight back — the results
 * page shows an "unlock your results" state instead. Platform-level codes go to the purchase page with a
 * return URL it honours once access is granted.
 */
export function purchaseRedirectFor(pathname: string, search: string, code: unknown): string | null {
  if (code === PAID_RESULTS_REQUIRED_CODE) return null;
  if (PAYWALL_REDIRECT_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return `${COMPLETE_PURCHASE_ROUTE}?returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

/** Indirection so tests can observe the navigation (jsdom's location.assign is not spy-able). */
export const paywallNavigation = { assign: (url: string) => window.location.assign(url) };
// N gated queries mounting at once must produce ONE navigation, not N.
let lastPaywallRedirectAt = 0;
const PAYWALL_REDIRECT_COOLDOWN_MS = 10_000;

function handlePaymentRequired(code: unknown) {
  if (typeof window === 'undefined') return;
  const target = purchaseRedirectFor(window.location.pathname, window.location.search, code);
  if (!target) return;
  const now = Date.now();
  if (now - lastPaywallRedirectAt < PAYWALL_REDIRECT_COOLDOWN_MS) return;
  lastPaywallRedirectAt = now;
  paywallNavigation.assign(target);
}

// Flag to prevent infinite refresh loops
let isRefreshing = false;
// Queue of requests waiting for token refresh
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

function processQueue(error: Error | null, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
}

// Response interceptor to handle errors uniformly and auto-refresh on 401
apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      // Circuit breaker: a 401 on a request we ALREADY refreshed-and-retried
      // means the session is unrecoverable in this browser (e.g. the refreshed
      // httpOnly cookie is blocked cross-site and the store's Bearer is stale).
      // Without this, React Query keeps refetching → endless refresh churn that
      // looks like a crash. Force a clean logout → /login instead of looping.
      if (status === 401 && originalRequest._retry && isLoggedIn()) {
        toast.error(i18n.t('components.apiClient.sessionExpired'), { description: i18n.t('components.apiClient.logInAgain') });
        forceLogout(i18n.t('components.apiClient.sessionExpiredLong'));
        const dead = new Error(i18n.t('components.apiClient.sessionExpiredShort')) as Error & { status: number };
        dead.status = 401; // 4xx → apiRequest must NOT retry (no churn)
        return Promise.reject(dead);
      }

      // Attempt token refresh on 401, but only once per request, and only for
      // sessions that were actually logged in — anonymous visitors hitting an
      // auth-required endpoint (e.g. from the signup page) must NOT be
      // redirected to /login by the teardown path below.
      if (status === 401 && !originalRequest._retry && isLoggedIn()) {
        if (isRefreshing) {
          // Another refresh is in progress — queue this request
          return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(() => {
            return apiClient(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const newTokens = await refreshAccessToken();
          if (newTokens) {
            processQueue(null, 'refreshed');
            return apiClient(originalRequest);
          } else {
            // Refresh failed — full session teardown (store + cookies) and redirect.
            // Tearing down only cookies leaves the persisted store authenticated,
            // which makes AuthWrapper bounce /login back into the portal forever.
            processQueue(new Error('Token refresh failed'));
            toast.error(i18n.t('components.apiClient.sessionExpired'), { description: i18n.t('components.apiClient.logInAgain') });
            forceLogout(i18n.t('components.apiClient.sessionExpiredLong'));
            return Promise.reject(new Error(i18n.t('components.apiClient.sessionExpiredShort')));
          }
        } catch (refreshError) {
          processQueue(refreshError as Error);
          toast.error(i18n.t('components.apiClient.sessionExpired'), { description: i18n.t('components.apiClient.logInAgain') });
          forceLogout(i18n.t('components.apiClient.sessionExpiredLong'));
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      let message = data?.message || error.message;

      switch (status) {
        case 401:
          message = i18n.t('components.apiClient.sessionExpiredLong');
          break;
        case 403:
          message = i18n.t('components.apiClient.noPermission');
          break;
        case 404:
          message = i18n.t('components.apiClient.notFound');
          break;
        case 500:
          message = i18n.t('components.apiClient.internalError');
          break;
        default:
          message = (status >= 500) ? i18n.t('components.apiClient.tryAgain') : (data?.message || i18n.t('components.apiClient.requestFailed'));
      }
      if (status === 402) {
        // audit 2026-10-09 C18: a 4xx, so apiRequest and React Query never retry it.
        handlePaymentRequired(data?.code);
      }
      if (data?.code === 'AI_BUDGET_EXCEEDED') {
        message = i18n.t('components.apiClient.aiBudgetExceeded');
      }
      if (data?.code === 'BROADCAST_TOO_LARGE') {
        // audit 2026-10-09 D4: the API refuses the whole broadcast instead of silently reaching part of the group.
        message = i18n.t('components.apiClient.broadcastTooLarge', { count: data?.recipientCount, max: data?.maxRecipients });
      }

      if (status === 403 && data?.code !== 'SUBSCRIPTION_REQUIRED') {
        // Subscription-gate 403s are handled by AuthWrapper's /subscribe redirect;
        // toasting each gated query produced a toast wall during the bounce.
        // Stable id: repeat 403s replace the toast instead of stacking.
        toast.warning(i18n.t('components.apiClient.accessDenied'), { id: 'access-denied', description: message });
      }
      // 5xx and network errors: callers decide whether to toast
      // (React Query has its own retry, so toasting here causes false alarms)

      const enhancedError = new Error(message) as Error & { status: number; data: unknown };
      enhancedError.status = status;
      enhancedError.data = data;
      return Promise.reject(enhancedError);
    } else if (error.request) {
      return Promise.reject(new Error(i18n.t('components.apiClient.networkError')));
    } else {
      return Promise.reject(new Error(error.message || i18n.t('components.apiClient.unexpected')));
    }
  }
);

function currentActingSchoolId(role: string | null | undefined): string | undefined {
  return actingSchoolHeaderFor(window.location.pathname, normalizeRole(role) === Roles.SUPER_ADMIN);
}

/**
 * Headers for the few raw `fetch` downloads (Blob responses) that bypass this client's interceptor, so a Super
 * Admin's export acts on the same school as the page it was started from.
 */
export function actingSchoolFetchHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const { useGlobalStore } = require("@/store/useGlobalStore");
  const actingSchoolId = currentActingSchoolId(useGlobalStore.getState().user.role);
  return actingSchoolId ? { [ACTING_SCHOOL_HEADER]: actingSchoolId } : {};
}

// Request interceptor — attach Bearer token from store as fallback for cross-site cookie blocking
apiClient.interceptors.request.use(
  config => {
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      const headers = config.headers as {
        delete?: (name: string) => void;
        setContentType?: (value?: string | false) => void;
      };
      headers?.delete?.("Content-Type");
      headers?.delete?.("content-type");
      headers?.setContentType?.(undefined);
    }

    if (typeof window !== "undefined") {
      const { useGlobalStore } = require("@/store/useGlobalStore");
      const { user } = useGlobalStore.getState();
      const token = user.accessToken;
      if (token && !config.headers?.["Authorization"]) {
        config.headers.set("Authorization", `Bearer ${token}`);
      }

      // Super Admin inside a school (lib/actingSchool.ts): tell the backend which school.
      const actingSchoolId = currentActingSchoolId(user.role);
      if (actingSchoolId) {
        config.headers.set(ACTING_SCHOOL_HEADER, actingSchoolId);
      }
    }
    return config;
  },
  error => Promise.reject(error)
);

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Generic API request function with retry logic.
// Only reads retry by default: a write that timed out or 5xx'd may already have been applied
// (or billed, for AI calls), so re-sending it would duplicate it. Pass `retries` to opt in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiRequest<T = any>(
  path: string,
  config?: AxiosRequestConfig & { retries?: number; showErrorToast?: boolean; retryOnRateLimit?: boolean }
): Promise<T> {
  const isIdempotent = IDEMPOTENT_METHODS.has((config?.method || 'GET').toUpperCase());
  const { retries = isIdempotent ? 2 : 0, showErrorToast, retryOnRateLimit = false, ...axiosConfig } = config || {};

  // Default: toast for mutations (POST/PUT/DELETE/PATCH), not for GET
  // GET requests are typically managed by React Query which has its own retry
  const shouldToast = showErrorToast ?? (axiosConfig.method && axiosConfig.method !== 'GET');

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await apiClient.request<T>({ url: path, ...axiosConfig });
      return response.data;
    } catch (error) {
      lastError = error as Error;

      // Don't retry client errors by default. 429 is server backpressure; retrying
      // it from every mounted query can turn one throttle event into a request storm.
      const status = (error as Error & { status?: number })?.status;
      if (status && status >= 400 && status < 500 && (status !== 429 || !retryOnRateLimit)) {
        throw error;
      }

      // Don't retry on the last attempt
      if (attempt === retries) {
        if (shouldToast) {
          if (status && status >= 500) {
            toast.error(i18n.t('components.apiClient.serverError'), { description: i18n.t('components.apiClient.tryAgain') });
          } else if (!status) {
            toast.error(i18n.t('components.apiClient.connectionLost'), { description: i18n.t('components.apiClient.checkConnection') });
          }
        }
        throw error;
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
