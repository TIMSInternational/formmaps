
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

// Create an Axios instance with base URL and default headers
const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Response interceptor to handle errors uniformly
apiClient.interceptors.response.use(
  response => response,
  error => {
    // Handle different types of errors
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data;

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
          message = data?.message || `Request failed with status ${status}`;
      }

      const enhancedError = new Error(message);
      (enhancedError as any).status = status;
      (enhancedError as any).data = data;
      return Promise.reject(enhancedError);
    } else if (error.request) {
      // Network error
      return Promise.reject(new Error('Network error. Please check your connection and try again.'));
    } else {
      // Something else happened
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
  config?: AxiosRequestConfig & { retries?: number }
): Promise<T> {
  const { retries = 2, ...axiosConfig } = config || {};

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
        throw error;
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
