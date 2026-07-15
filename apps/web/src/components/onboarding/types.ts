export interface CoachOnboardingData {
  personalInfo: {
    name: string;
    title: string;
    bio: string;
    specialization: string;
    location: string;
    languages: string[];
    tags: string[];
    image: string | null; // URL or base64
  };
  pricing: {
    hourlyRate: number;
    currency: string;
  };
  availability: {
    timezone: string;
    weeklySchedule: WeeklySchedule[];
  };
  calendarIntegrations: {
    google: boolean;
    outlook: boolean;
  };
  password?: string;
}

export interface WeeklySchedule {
  day: string;
  enabled: boolean;
  timeSlots: TimeSlot[];
}

export interface TimeSlot {
  start: string;
  end: string;
}

export const INITIAL_ONBOARDING_DATA: CoachOnboardingData = {
  personalInfo: {
    name: "",
    title: "",
    bio: "",
    specialization: "",
    location: "",
    languages: [],
    tags: [],
    image: null,
  },
  pricing: {
    hourlyRate: 50,
    currency: "USD",
  },
  availability: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weeklySchedule: [
      { day: "Monday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
      { day: "Tuesday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
      { day: "Wednesday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
      { day: "Thursday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
      { day: "Friday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
      { day: "Saturday", enabled: false, timeSlots: [] },
      { day: "Sunday", enabled: false, timeSlots: [] },
    ],
  },
  calendarIntegrations: {
    google: false,
    outlook: false,
  },
  password: "",
};
