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

export interface UserSettings {
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  theme: "light" | "dark" | "system";
  language: string;
  privacy: {
    profileVisibility: "public" | "private" | "connections";
    showActivity: boolean;
  };
}
