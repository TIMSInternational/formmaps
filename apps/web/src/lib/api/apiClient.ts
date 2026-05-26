import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { toast } from '@/hooks/useToast';
import { refreshAccessToken, clearTokens } from '@/services/tokenRefreshService';

// Create an Axios instance with base URL and default headers
const apiClient: AxiosInstance = axios.create({
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

      // Attempt token refresh on 401, but only once per request
      if (status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // Another refresh is in progress — queue this request
          return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(token => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return apiClient(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const newTokens = await refreshAccessToken();
          if (newTokens) {
            originalRequest.headers['Authorization'] = `Bearer ${newTokens.accessToken}`;
            processQueue(null, newTokens.accessToken);
            return apiClient(originalRequest);
          } else {
            // Refresh failed — redirect to login
            processQueue(new Error('Token refresh failed'));
            clearTokens();
            toast.error('Session expired', { description: 'Please log in again.' });
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
            return Promise.reject(new Error('Session expired. Please log in again.'));
          }
        } catch (refreshError) {
          processQueue(refreshError as Error);
          clearTokens();
          toast.error('Session expired', { description: 'Please log in again.' });
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
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

      if (status === 403) {
        toast.warning('Access denied', { description: message });
      }
      // 5xx and network errors: callers decide whether to toast
      // (React Query has its own retry, so toasting here causes false alarms)

      const enhancedError = new Error(message);
      (enhancedError as any).status = status;
      (enhancedError as any).data = data;
      return Promise.reject(enhancedError);
    } else if (error.request) {
      return Promise.reject(new Error('Network error. Please check your connection and try again.'));
    } else {
      return Promise.reject(new Error(error.message || 'An unexpected error occurred.'));
    }
  }
);

// Request interceptor to attach JWT token if present
apiClient.interceptors.request.use(
  config => {
    try {
      const token = localStorage.getItem('token');
      if (token && config.headers) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {}
    return config;
  },
  error => Promise.reject(error)
);

// Generic API request function with retry logic
export async function apiRequest<T = any>(
  path: string,
  config?: AxiosRequestConfig & { retries?: number; showErrorToast?: boolean }
): Promise<T> {
  const { retries = 2, showErrorToast, ...axiosConfig } = config || {};

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

      // Don't retry on client errors (4xx) except 429 (rate limited)
      const status = (error as any)?.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
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
