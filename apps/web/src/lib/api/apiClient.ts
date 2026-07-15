import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { toast } from '@/hooks/useToast';
import { refreshAccessToken, isLoggedIn } from '@/services/tokenRefreshService';
import { forceLogout } from '@/utils/tokenUtils';

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
        toast.error('Session expired', { description: 'Please log in again.' });
        forceLogout('Your session has expired. Please log in again.');
        const dead = new Error('Session expired. Please log in again.') as Error & { status: number };
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
            toast.error('Session expired', { description: 'Please log in again.' });
            forceLogout('Your session has expired. Please log in again.');
            return Promise.reject(new Error('Session expired. Please log in again.'));
          }
        } catch (refreshError) {
          processQueue(refreshError as Error);
          toast.error('Session expired', { description: 'Please log in again.' });
          forceLogout('Your session has expired. Please log in again.');
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      let message = data?.message || error.message;

      switch (status) {
        case 401:
          message = 'Your session has expired. Please log in again.';
          break;
        case 403:
          message = 'You do not have permission to perform this action.';
          break;
        case 404:
          message = 'The requested resource was not found.';
          break;
        case 500:
          message = 'Internal server error. Please try again later.';
          break;
        default:
          message = (status >= 500) ? 'Something went wrong. Please try again.' : (data?.message || 'Request failed. Please try again.');
      }

      if (status === 403 && data?.code !== 'SUBSCRIPTION_REQUIRED') {
        // Subscription-gate 403s are handled by AuthWrapper's /subscribe redirect;
        // toasting each gated query produced a toast wall during the bounce.
        // Stable id: repeat 403s replace the toast instead of stacking.
        toast.warning('Access denied', { id: 'access-denied', description: message });
      }
      // 5xx and network errors: callers decide whether to toast
      // (React Query has its own retry, so toasting here causes false alarms)

      const enhancedError = new Error(message) as Error & { status: number; data: unknown };
      enhancedError.status = status;
      enhancedError.data = data;
      return Promise.reject(enhancedError);
    } else if (error.request) {
      return Promise.reject(new Error('Network error. Please check your connection and try again.'));
    } else {
      return Promise.reject(new Error(error.message || 'An unexpected error occurred.'));
    }
  }
);

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
      const token = useGlobalStore.getState().user.accessToken;
      if (token && !config.headers?.["Authorization"]) {
        config.headers.set("Authorization", `Bearer ${token}`);
      }
    }
    return config;
  },
  error => Promise.reject(error)
);

// Generic API request function with retry logic
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiRequest<T = any>(
  path: string,
  config?: AxiosRequestConfig & { retries?: number; showErrorToast?: boolean; retryOnRateLimit?: boolean }
): Promise<T> {
  const { retries = 2, showErrorToast, retryOnRateLimit = false, ...axiosConfig } = config || {};

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
            toast.error('Server error', { description: 'Something went wrong. Please try again.' });
          } else if (!status) {
            toast.error('Connection lost', { description: 'Please check your internet connection.' });
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
