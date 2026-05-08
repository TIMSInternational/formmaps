import {
  Coach,
  OnboardingStatus,
  OnboardingData,
  CoachesResponse,
  Booking,
  BookingResponse,
  Availability,
  Review,
  CoachAnalytics,
  StudentSummary,
  StudentDetails,
  Payout,
  PayoutStatus,
  BankAccount,
  Notification,
  CoachSlotsResponse,
} from "../types/coach";
import { apiRequest } from "@/lib/api/apiClient";

export type { CoachesResponse };

// --- Onboarding Endpoints ---

export async function getOnboardingStatus(
  coachId: string,
): Promise<OnboardingStatus> {
  const res = await apiRequest(`/api/v1/coach/${coachId}/onboarding-status`);
  return res.data;
}

export async function submitOnboardingData(
  coachId: string,
  data: OnboardingData,
): Promise<{ success: boolean; coachId: string; redirectUrl: string }> {
  return apiRequest(`/api/v1/coach/${coachId}/onboarding`, {
    method: "POST",
    data,
  });
}

export async function getCalendarAuthUrl(
  provider: "google" | "outlook",
  email?: string,
  redirectUrl?: string,
): Promise<{ url: string }> {
  const query = new URLSearchParams();
  if (email) query.append("email", email);
  if (redirectUrl) query.append("redirectUrl", redirectUrl);

  const path = `/api/v1/auth/${provider}/url${query.toString() ? `?${query.toString()}` : ""}`;
  const data = await apiRequest(path);

  // Handle both 'url' and 'callbackurl' response formats and nested response payloads
  // Some APIs return { data: { url: '...' } } while others return { url: '...' }
  const nested = data && typeof data === "object" ? data.data || data : data;
  const url =
    nested?.url || nested?.callbackurl || data?.url || data?.callbackurl;
  if (!url) {
    throw new Error(
      `API did not return a valid URL. Response: ${JSON.stringify(data)}`,
    );
  }
  return { url };
}

export async function checkCalendarAuthStatus(
  provider: "google" | "outlook",
  email: string,
): Promise<{
  isAuthenticated: boolean;
  email: string;
  userId: string;
  authDetails: {
    connected: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    isTokenValid: boolean;
    isTokenExpired: boolean;
    tokenStatus: string;
    provider: string;
  };
}> {
  const res = await apiRequest(
    `/api/v1/auth/${provider}/status?email=${email}`,
  );
  return res.data || res;
}

export async function disconnectCalendar(
  provider: "google" | "outlook",
  email?: string,
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/v1/auth/${provider}/disconnect`, {
    method: "DELETE",
    data: email ? { email } : undefined,
  });
}

export async function checkGoogleAuthStatus(email: string): Promise<{
  isAuthenticated: boolean;
  email: string;
  userId: string;
  authDetails: {
    connected: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    isTokenValid: boolean;
    isTokenExpired: boolean;
    tokenStatus: string;
  };
}> {
  const res = await apiRequest(
    `/api/v1/coach/auth/google/status?email=${email}`,
  );
  return res.data || res;
}

// --- User Side APIs ---

export async function getCoaches(
  params: {
    page?: number;
    limit?: number;
    specialization?: string;
    search?: string;
  } = {},
): Promise<CoachesResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page.toString());
  if (params.limit) query.append("limit", params.limit.toString());
  if (params.specialization)
    query.append("specialization", params.specialization);
  if (params.search) query.append("search", params.search);

  return apiRequest(`/api/v1/coach?${query.toString()}`);
}

// --- New Coach Dashboard APIs ---
export async function getCoachAnalytics(dateRange?: string): Promise<{ data: CoachAnalytics }> {
  const query = dateRange ? `?range=${dateRange}` : "";
  return apiRequest(`/api/v1/coach/me/analytics${query}`);
}

export async function getCoachAnalyticsReport(
  startDate?: string,
  endDate?: string,
  type: "csv" | "pdf" = "pdf",
): Promise<Blob | { data: any }> {
  const query = new URLSearchParams();
  if (startDate) query.append("startDate", startDate);
  if (endDate) query.append("endDate", endDate);
  if (type) query.append("type", type);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const url = `${baseUrl}/api/v1/coach/me/analytics/report?${query.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch analytics report");
  const contentType = response.headers.get("content-type") || "";
  if (
    contentType.includes("application/pdf") ||
    contentType.includes("text/csv")
  ) {
    return response.blob();
  }
  return response.json();
}

export async function getBookingNotes(
  bookingId: string,
): Promise<{ notes: string }> {
  return apiRequest(`/api/v1/bookings/${bookingId}/notes`);
}

export async function updateBookingNotes(
  bookingId: string,
  notes: string,
): Promise<{ success: boolean; notes: string }> {
  return apiRequest(`/api/v1/bookings/${bookingId}/notes`, {
    method: "PUT",
    data: { notes },
  });
}

export async function getCoachStudentById(
  studentId: string,
): Promise<{ data: StudentDetails }> {
  return apiRequest(`/api/v1/coach/me/students/${studentId}`);
}

export interface CoachPayoutsSummary {
  completedCount?: number;
  pendingCount?: number;
  processingCount?: number;
  failedCount?: number;
  completedAmount?: number;
  pendingAmount?: number;
  processingAmount?: number;
}

export interface CoachPayoutsResponse {
  items: Payout[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
  totalPayouts?: number;
  pendingPayouts?: number;
  summary?: CoachPayoutsSummary;
}

export async function getCoachPayouts(params?: {
  page?: number;
  limit?: number;
  status?: PayoutStatus;
}): Promise<CoachPayoutsResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.status) query.append("status", params.status);

  const path = `/api/v1/coach/me/payouts${query.toString() ? `?${query.toString()}` : ""}`;
  const json = await apiRequest(path);
  const payload = json?.data ?? json;
  const items = Array.isArray(payload)
    ? payload
    : payload?.items || payload?.data || payload?.payouts || [];

  return {
    items: Array.isArray(items) ? items : [],
    total:
      payload?.total ??
      payload?.totalCount ??
      (Array.isArray(items) ? items.length : 0),
    page: payload?.page ?? params?.page ?? 1,
    limit: payload?.limit ?? params?.limit ?? 20,
    totalPages: payload?.totalPages,
    totalPayouts: payload?.totalPayouts,
    pendingPayouts: payload?.pendingPayouts,
    summary: payload?.summary,
  };
}

export async function getCoachBankAccount(): Promise<{ data: BankAccount }> {
  return apiRequest(`/api/v1/coach/me/bank-account`);
}

export async function linkCoachBankAccount(data?: {
  accountNumber?: string;
  routingNumber?: string;
  accountHolderName?: string;
  bankName?: string;
  accountType?: "checking" | "savings";
  provider?: "stripe" | "manual";
}): Promise<{
  onboardingUrl?: string;
  success?: boolean;
  message?: string;
  accountId?: string;
  status?: string;
}> {
  // Default to Stripe Connect with minimal required fields
  const requestBody = {
    provider: data?.provider || "stripe",
    accountType: data?.accountType || "checking",
    accountHolderName: data?.accountHolderName || "",
    bankName: data?.bankName || "",
    ...(data?.accountNumber && { accountNumber: data.accountNumber }),
    ...(data?.routingNumber && { routingNumber: data.routingNumber }),
  };

  return apiRequest(`/api/v1/coach/me/bank-account`, {
    method: "POST",
    data: requestBody,
  });
}

export async function getNotifications(): Promise<{ data: Notification[] }> {
  return apiRequest(`/api/v1/notifications`);
}

export async function markNotificationRead(
  notificationId: string,
): Promise<{ success: boolean }> {
  return apiRequest(`/api/v1/notifications/${notificationId}/read`, {
    method: "PUT",
  });
}

export async function getCoachDetails(coachId: string): Promise<Coach> {
  const res = await apiRequest(`/api/v1/coach/${coachId}`);
  return res.data;
}

// Get coach availability for a specific date
export async function getCoachAvailableSlots(
  coachId: string,
  date: string,
  timezone?: string,
): Promise<CoachSlotsResponse> {
  const query = new URLSearchParams();
  query.append("date", date);
  if (timezone) query.append("timezone", timezone);

  try {
    const res = await apiRequest(
      `/api/v1/coach/${coachId}/slots?${query.toString()}`,
    );
    return res.data;
  } catch {
    // If endpoint returns an error, return a safe empty object matching the interface
    // so the UI can handle it gracefully (e.g. show "no availability")
    return {
      date,
      timezone: timezone || "UTC",
      coachId,
      sessionDurationMinutes: 30, // Fallback default
      price: { amount: 0, currency: "USD" },
      slots: [],
    };
  }
}

export async function bookSession(data: {
  coachId: string;
  slot: { start: string; end: string };
  topic: string;
  notes?: string;
}): Promise<BookingResponse> {
  return apiRequest(`/api/v1/bookings`, { method: "POST", data });
}

// --- User Sessions API ---

export async function getUserSessions(
  status: "upcoming" | "past" | "all" = "all",
): Promise<{ data: Booking[] }> {
  return apiRequest(`/api/v1/bookings/me?status=${status}`);
}

// --- Coach Dashboard APIs ---

export async function getCoachSessions(
  status: "upcoming" | "past" | "all" = "all",
  startDate?: string,
  endDate?: string,
): Promise<{ data: Booking[] }> {
  const query = new URLSearchParams();
  query.append("status", status);
  if (startDate) query.append("startDate", startDate);
  if (endDate) query.append("endDate", endDate);

  return apiRequest(`/api/v1/coach/me/sessions?${query.toString()}`);
}

export async function rescheduleSession(
  bookingId: string,
  newSlot: { start: string; end: string },
): Promise<BookingResponse> {
  return apiRequest(`/api/v1/bookings/${bookingId}/reschedule`, {
    method: "PUT",
    data: { newSlot },
  });
}

export async function getAvailability(): Promise<Availability> {
  const res = await apiRequest(`/api/v1/coach/me/availability`);
  return res.data;
}

export async function updateAvailability(
  availability: Availability,
): Promise<Availability> {
  const res = await apiRequest(`/api/v1/coach/me/availability`, {
    method: "PUT",
    data: availability,
  });
  return res.data;
}

export async function getCoachProfile(): Promise<Coach> {
  const res = await apiRequest(`/api/v1/coach/me`);
  return res.data || res;
}

export async function updateCoachProfile(data: Partial<Coach>): Promise<Coach> {
  return apiRequest(`/api/v1/coach/me`, { method: "PUT", data });
}

export async function cancelSession(
  bookingId: string,
  reason: string,
): Promise<BookingResponse> {
  return apiRequest(`/api/v1/bookings/${bookingId}/cancel`, {
    method: "POST",
    data: { reason },
  });
}

// --- Reviews ---

export async function submitReview(
  coachId: string,
  data: { bookingId: string; rating: number; comment: string },
): Promise<Review> {
  return apiRequest(`/api/v1/coach/${coachId}/reviews`, {
    method: "POST",
    data,
  });
}

// --- Admin APIs ---

// Coach Statistics Interface and API
export interface CoachStats {
  totalCoaches: number;
  activeNow: number;
  pendingInvites: number;
  expiringContracts: number;
  statusBreakdown: {
    active: number;
    invited: number;
    pending: number;
    inactive: number;
  };
}

/**
 * Get aggregated statistics for all coaches in the system.
 * This endpoint is optimized for the admin dashboard, aggregating data at the database level.
 */
export async function getCoachStats(): Promise<CoachStats> {
  const res = await apiRequest(`/api/v1/admin/coaches/stats`);
  return res.data || res;
}

export async function getAllCoachesAdmin(
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<CoachesResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page.toString());
  if (params.limit) query.append("limit", params.limit.toString());
  if (params.search) query.append("search", params.search);

  return apiRequest(`/authapi/coaches?${query.toString()}`);
}

export async function inviteCoach(data: {
  email: string;
  name?: string;
  contractStart?: string;
  contractEnd?: string;
}): Promise<{ message: string; invitationId: string }> {
  return apiRequest(`/authapi/invite-coach`, { method: "POST", data });
}

export async function inviteCoachBulk(file: File): Promise<any[]> {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest(`/authapi/invite-coach-bulk`, {
    method: "POST",
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function updateCoach(
  coachId: string,
  data: Partial<Coach>,
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/authapi/coaches/${coachId}`, { method: "PUT", data });
}

export async function signupCoachBulk(
  coaches: { fullName: string; email: string; password?: string }[],
): Promise<any[]> {
  return apiRequest(`/authapi/signup-coach-bulk`, {
    method: "POST",
    data: { coaches },
  });
}

// --- Test Function ---

export async function testCoachAPIs(): Promise<void> {
  try {
    // Test get coaches
    const coaches = await getCoaches({ limit: 5 });

    if (coaches.data.length > 0) {
      const coachId = coaches.data[0].id;
      const details = await getCoachDetails(coachId);
    }
  } catch (error) {
    // error handled silently
  }
}

export async function uploadProfileImage(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64Image = reader.result as string;
        const res = await apiRequest(`/api/v1/coach/me`, {
          method: "PUT",
          data: { image: base64Image },
        });
        resolve(res);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
  });
}

export async function getCoachStudents(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{ data: any[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.search) query.append("search", params.search);

  const res = await apiRequest(
    `/api/v1/coach/me/students?${query.toString()}`,
  );
  return res.data;
}

export async function getCoachStudentDetails(studentId: string): Promise<any> {
  const res = await apiRequest(`/api/v1/coach/me/students/${studentId}`);
  return res.data;
}

// --- Earnings & Payout APIs ---

export interface CoachEarningsStats {
  totalEarnings: number;
  pendingPayout: number;
  lastPayoutAmount: number;
  lastPayoutDate: string;
}

export interface EarningsHistoryItem {
  date: string;
  description: string;
  amountGross: number;
  platformFee: number;
  amountNet: number;
  status: "completed" | "pending" | "cancelled";
}

export interface PayoutSettings {
  frequency: "biweekly" | "monthly";
  method: "stripe" | "bank_transfer";
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
  bankName?: string;
  accountHolderName?: string;
  last4?: string;
}

export async function getCoachEarnings(): Promise<CoachEarningsStats> {
  const res = await apiRequest(`/api/v1/coach/me/earnings`);
  return res.data || res;
}

export async function getCoachEarningsHistory(): Promise<
  EarningsHistoryItem[]
> {
  const res = await apiRequest(`/api/v1/coach/me/earnings/history`);
  return res.data || res;
}

export async function exportCoachEarnings(
  format: "csv" | "pdf" = "csv",
): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const response = await fetch(
    `${baseUrl}/api/v1/coach/me/earnings/export?format=${format}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) throw new Error("Failed to export earnings");

  // Handle file download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `earnings-report-${new Date().toISOString().split("T")[0]}.${format}`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function getCoachPayoutSettings(): Promise<PayoutSettings> {
  const res = await apiRequest(`/api/v1/coach/me/payout-settings`);
  return res.data || res;
}

export async function updateCoachPayoutSettings(
  settings: Partial<PayoutSettings>,
): Promise<PayoutSettings> {
  // Map UI field names to API field names
  const requestBody: any = {};
  if (settings.frequency) requestBody.frequency = settings.frequency;
  if (settings.method) requestBody.method = settings.method;
  if (settings.bankAccountNumber)
    requestBody.bankAccountNumber = settings.bankAccountNumber;
  if (settings.bankRoutingNumber)
    requestBody.bankRoutingNumber = settings.bankRoutingNumber;
  if (settings.bankName) requestBody.bankName = settings.bankName;
  if (settings.accountHolderName)
    requestBody.accountHolderName = settings.accountHolderName;

  const res = await apiRequest(`/api/v1/coach/me/payout-settings`, {
    method: "PUT",
    data: requestBody,
  });
  return res.data || res;
}

// --- Billing APIs ---

export interface CoachBillingResponse {
  currentPeriod: {
    period: string;
    totalRevenue: number;
    totalBookings: number;
    platformFeeAmount: number;
    dueDate: string;
    status: "pending" | "paid" | "overdue";
  } | null;
  billingHistory: {
    items: Array<{
      id: string;
      period: string;
      totalRevenue: number;
      platformFeeAmount: number;
      status: "paid" | "pending" | "overdue";
    }>;
    page: number;
    totalPages: number;
  };
}

export async function getCoachBilling(params?: {
  page?: number;
  limit?: number;
}): Promise<CoachBillingResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());

  const res = await apiRequest(
    `/api/v1/coach/me/billing${query.toString() ? `?${query.toString()}` : ""}`,
  );
  return res.data || res;
}

export async function downloadInvoice(billingId: string): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const response = await fetch(
    `${baseUrl}/api/v1/coach/me/billing/${billingId}/invoice`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) throw new Error("Failed to download invoice");

  // Handle file download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${billingId}.pdf`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
