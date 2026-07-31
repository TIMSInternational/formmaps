export interface Coach {
  id: string;
  name: string;
  fullName?: string; // For admin view
  title?: string;
  bio?: string;
  specialization?: string;
  image?: string;
  rating?: number;
  reviews?: number | Review[];
  location?: string;
  languages?: string[];
  tags?: string[];
  availability?: Availability;
  email?: string; // For admin view
  status?: string; // For admin view
  joinedAt?: string; // For admin view
  activeStudents?: number; // For admin view
  contractStart?: string; // For admin view
  contractEnd?: string; // For admin view
  platformCommission?: number; // For admin view - platform commission percentage
  hourlyRate?: number;
  currency?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
}

export interface OnboardingStatus {
  id: string;
  userId: string;
  email: string;
  name?: string;
  status: "invited" | "onboarding_started" | "completed";
  invitedAt?: string;
}

export interface PersonalInfo {
  name: string;
  title: string;
  bio: string;
  specialization: string;
  location: string;
  languages: string[];
  tags: string[];
  image?: string | null;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface DaySchedule {
  day: string;
  enabled: boolean;
  timeSlots: TimeSlot[];
}

export interface Availability {
  timezone: string;
  weeklySchedule: DaySchedule[];
}

export interface CalendarIntegration {
  connected: boolean;
  accessToken?: string;
}

export interface CalendarIntegrations {
  google: CalendarIntegration;
  outlook: CalendarIntegration;
}

export interface OnboardingData {
  personalInfo: PersonalInfo;
  pricing?: { hourlyRate: number; currency: string };
  availability: Availability;
  calendarIntegrations: CalendarIntegrations;
  password?: string;
}

export interface BookingSlot {
  start: string;
  end: string;
}

export interface Booking {
  id: string;
  coachId?: string;
  studentName?: string; // For coach dashboard
  studentImage?: string; // For coach dashboard
  topic: string;
  notes?: string;
  startTime?: string; // Flattened for easier UI consumption if needed, or use slot
  endTime?: string;
  slot?: BookingSlot;
  status:
    | "confirmed"
    | "rescheduled"
    | "cancelled"
    | "completed"
    | "pending_payment";
  meetingLink?: string;
}

export interface Review {
  id: string;
  bookingId: string;
  rating: number;
  comment: string;
  status?: string;
}

export interface CoachesResponse {
  data: Coach[];
  meta: {
    total: number;
    page: number;
    pages?: number; // Some APIs return pages
    limit?: number; // Some APIs return limit
    totalPages?: number; // Some APIs return totalPages
  };
}

export interface BookingResponse {
  id: string;
  status: string;
  meetingLink?: string;
  newStartTime?: string; // For reschedule response
}

// --- New types for Analytics, Payouts, Bank Account, Notifications, and Students ---
export interface EarningsHistoryItem {
  month: string;
  amount: number;
}

export interface SessionDistributionItem {
  topic: string;
  count: number;
}

export interface RecentActivityItem {
  id: string;
  type: string;
  message: string;
  date: string;
}

export interface CoachAnalytics {
  totalEarnings: number;
  totalSessions: number;
  averageRating: number;
  activeStudents?: number;
  clientCount?: number;
  earningsHistory?: EarningsHistoryItem[];
  monthlyData?: { month: string; earnings: number; sessions: number }[];
  sessionDistribution?: SessionDistributionItem[];
  recentActivity?: RecentActivityItem[];
}

export type PayoutStatus = "pending" | "processing" | "completed" | "failed";

export interface Payout {
  id: string;
  amount: number;
  platformFeeAmount?: number;
  netAmount?: number;
  platformFeePercentage?: number;
  currency: string;
  status: PayoutStatus;
  requestedAt?: string;
  processedAt?: string;
  approvedAt?: string;
  periodStart?: string;
  periodEnd?: string;
  transactionId?: string;
  notes?: string;
  failureReason?: string;
  coachId?: string;
  coachName?: string;
  coachEmail?: string;
}

export interface BankAccount {
  id?: string;
  provider?: string; // e.g., stripe
  status?: string; // connected, disconnected
  isConnected?: boolean; // Whether bank account is connected
  requiresOnboarding?: boolean; // Whether Stripe onboarding is required
  onboardingUrl?: string; // if available
  onboardingLink?: string; // Stripe Connect onboarding URL
  email?: string;
  last4?: string | null;
  accountType?: string; // checking, savings
  bankName?: string;
  accountHolderName?: string;
}

export interface Notification {
  id: string;
  type: string; // e.g., booking, message, system
  message: string;
  date: string;
  read: boolean;
}

export interface StudentSummary {
  id: string;
  name: string;
  email?: string;
  image?: string;
  // API field is lastSessionDate (coachBookingsService.getCoachStudents).
  lastSessionDate?: string;
  totalSessions?: number;
  completedSessions?: number;
}

export interface StudentDetails extends StudentSummary {
  activity?: RecentActivityItem[];
  sessions?: Booking[];
}

export interface CoachSlotsParams {
  date: string;
  timezone?: string;
}

export interface CoachSlotsResponse {
  date: string;
  timezone: string;
  coachId: string;
  sessionDurationMinutes: number;
  price: {
    amount: number;
    currency: string;
  };
  slots: string[];
  nextAvailableDate?: string;
}
