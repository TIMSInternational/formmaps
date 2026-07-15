export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  headline?: string;
  bio?: string;
  location?: string;
  phone?: string;
  avatarUrl?: string;
  coverUrl?: string;
  socialLinks?: {
    website?: string;
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  skills?: string[];
  stats?: {
    coursesCompleted: number;
    applicationsSubmitted: number;
    mentorshipSessions: number;
  };
}

export interface UserActivity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

/** Mirrors the API user_settings row (PUT/GET /api/v1/user/settings). */
export interface UserSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  bookingNotifications: boolean;
  courseNotifications: boolean;
  marketingEmails: boolean;
  theme: string;
  language: string;
  profileVisible: boolean;
  showEmail: boolean;
  showPhone: boolean;
  shareProgress: boolean;
  allowAnalytics: boolean;
}
