import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { generateDummyContent } from "@/app/dashboard/resume-builder/_components/dummyContentGenerator";
import { updateResume, getResumeById } from "@/services/resumeService";
import { telemetry } from "@/services/telemetryService";
import { isTokenExpired } from "@/utils/tokenUtils";

// Resume Builder Types
interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  github?: string;
  twitter?: string;
  portfolio?: string;
  professionalTitle?: string;
  dateOfBirth?: string;
  nationality?: string;
  languages?: string;
  maritalStatus?: string;
  driversLicense?: string;
  militaryService?: string;
  visaStatus?: string;
  preferredPronouns?: string;
  summary: string;
  careerObjective?: string;
  [key: string]: any; // Support for custom fields
}

interface Experience {
  id: string;
  jobTitle: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string[];
}

interface Education {
  id: string;
  degree: string;
  institution: string;
  location: string;
  graduationDate: string;
  gpa?: string;
}

interface Skill {
  id: string;
  name: string;
  category: "technical" | "soft" | "language";
  level: "beginner" | "intermediate" | "advanced" | "expert";
}

interface CustomField {
  id: string;
  name: string;
  value: string;
  type: "text" | "textarea";
  enabled: boolean;
}

interface DynamicSection {
  id: string;
  type: string;
  title: string;
  entries: Array<{
    id: string;
    [key: string]: any;
  }>;
  // For custom sections only
  description?: string;
  bullets?: string;
}

export interface ResumeData {
  careerField: string;
  // Optional legacy field for compatibility
  userProfile?: any;
  personalInfo: PersonalInfo;
  experience: Experience[];
  education: Education[];
  skills: Skill[];
  customFields?: CustomField[];
  dynamicSections?: DynamicSection[];
  template:
  | "modern"
  | "classic"
  | "creative"
  | "minimal"
  | "executive"
  | "tech";
}

// Global State Interface
interface GlobalState {
  // Theme
  theme: "light" | "dark";
  toggleTheme: () => void;

  // Language
  language: "english" | "spanish";
  setLanguage: (language: "english" | "spanish") => void;

  // User Authentication
  user: {
    id: string | null;
    email: string | null;
    name: string | null;
    role: string | null;
    schoolId?: string | null;
    image?: string | null;
    avatar?: string | null;
    contractEnd?: string | null;
    subscriptionStatus?: "active" | "past_due" | "canceled" | "none" | null;
    isAuthenticated: boolean;
  };
  setUser: (user: Partial<GlobalState["user"]>) => void;
  logout: () => void;
  initializeAuth: () => Promise<void>;

  // Resume Builder State
  resumeBuilder: {
    currentStep: number;
    data: ResumeData;
    isLoading: boolean;
    isDirty: boolean;
  };
  currentResumeId: string | null;
  setCurrentResumeId: (id: string | null) => void;
  loadResume: (data: ResumeData) => void;
  saveResumeToAPI: () => Promise<void>;
  setResumeStep: (step: number) => void;
  setCareerField: (careerField: string) => void;
  updatePersonalInfo: (info: Partial<PersonalInfo>) => void;
  addExperience: (experience: Omit<Experience, "id">) => void;
  updateExperience: (id: string, experience: Partial<Experience>) => void;
  removeExperience: (id: string) => void;
  addEducation: (education: Omit<Education, "id">) => void;
  updateEducation: (id: string, education: Partial<Education>) => void;
  removeEducation: (id: string) => void;
  addSkill: (skill: Omit<Skill, "id">) => void;
  removeSkill: (id: string) => void;
  addCustomField: (field: Omit<CustomField, "id">) => void;
  updateCustomField: (id: string, field: Partial<CustomField>) => void;
  removeCustomField: (id: string) => void;
  addDynamicSection: (section: Omit<DynamicSection, "id">) => void;
  updateDynamicSection: (id: string, section: Partial<DynamicSection>) => void;
  removeDynamicSection: (id: string) => void;
  addDynamicSectionEntry: (sectionId: string, entry: any) => void;
  updateDynamicSectionEntry: (
    sectionId: string,
    entryId: string,
    entry: any
  ) => void;
  removeDynamicSectionEntry: (sectionId: string, entryId: string) => void;
  setResumeTemplate: (template: ResumeData["template"]) => void;
  setResumeLoading: (loading: boolean) => void;
  resetResumeBuilder: () => void;
  populateWithDummyContent: (careerField: string) => void;

  // Navigation
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Settings
  platformFee: number;
  setPlatformFee: (fee: number) => void;
  fetchSettings: () => Promise<void>;
}

// Initial Resume Data
const initialResumeData: ResumeData = {
  careerField: "",
  personalInfo: {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    website: "",
    summary: "",
  },
  experience: [],
  education: [],
  skills: [],
  customFields: [],
  dynamicSections: [],
  template: "classic",
};

// Create the store
export const useGlobalStore = create<GlobalState>()(
  devtools(
    persist(
      (set, get) => ({
        // Theme
        theme: "light",
        toggleTheme: () =>
          set((state) => ({
            theme: state.theme === "light" ? "dark" : "light",
          })),

        // Language
        language: "english",
        setLanguage: (language: "english" | "spanish") => set({ language }),

        // User
        user: {
          id: null,
          email: null,
          name: null,
          role: null,
          image: null,
          avatar: null,
          isAuthenticated: false,
        },
        setUser: (userData) => {
          console.log("userData", userData)
          set((state) => ({
            user: { ...state.user, ...userData, isAuthenticated: true },
          }))
        },
        logout: () => {
          // Track logout event
          telemetry.trackAuth("logout");
          // Clear localStorage token
          if (typeof window !== "undefined") {
            localStorage.removeItem("token");
          }
          // Reset user state
          set({
            user: {
              id: null,
              email: null,
              name: null,
              role: null,
              image: null,
              avatar: null,
              isAuthenticated: false,
            },
          });
        },

        // Initialize authentication state from localStorage
        initializeAuth: async () => {
          if (typeof window !== "undefined") {
            const token = localStorage.getItem("token");
            const currentUser = get().user;

            // Check if token exists and is not expired
            if (token) {
              const tokenExpired = isTokenExpired(token);

              if (tokenExpired === true) {
                // Token is expired - clear it and reset state
                console.log("[Auth] Token expired, clearing session");
                localStorage.removeItem("token");
                set({
                  user: {
                    id: null,
                    email: null,
                    name: null,
                    role: null,
                    image: null,
                    avatar: null,
                    isAuthenticated: false,
                  },
                });
                return;
              }

              // Token is valid and we have user data, restore session
              if (currentUser.email) {
                set((state) => ({
                  user: { ...state.user, isAuthenticated: true },
                }));
                // Track login event
                telemetry.trackAuth("login", "session_restore");
              } else {
                // Token exists but no user data - clear the token
                localStorage.removeItem("token");
                set({
                  user: {
                    id: null,
                    email: null,
                    name: null,
                    role: null,
                    image: null,
                    avatar: null,
                    isAuthenticated: false,
                  },
                });
              }
            } else {
              // No token, ensure we're in unauthenticated state
              set({
                user: {
                  id: null,
                  email: null,
                  name: null,
                  role: null,
                  image: null,
                  avatar: null,
                  isAuthenticated: false,
                },
              });
            }
          }
        },

        // Resume Builder
        resumeBuilder: {
          currentStep: 1,
          data: initialResumeData,
          isLoading: false,
          isDirty: false,
        },
        currentResumeId: null,
        setCurrentResumeId: (id) => set({ currentResumeId: id }),
        loadResume: (data) =>
          set((state) => ({
            resumeBuilder: { ...state.resumeBuilder, data, isDirty: false },
          })),
        saveResumeToAPI: async () => {
          const state = get();
          if (state.currentResumeId && state.currentResumeId !== "new") {
            try {
              // Map store data to API format
              const apiData = {
                personal: {
                  fullName: state.resumeBuilder.data.personalInfo.fullName,
                  email: state.resumeBuilder.data.personalInfo.email,
                  phone: state.resumeBuilder.data.personalInfo.phone,
                  location: state.resumeBuilder.data.personalInfo.location,
                  linkedIn: state.resumeBuilder.data.personalInfo.linkedin,
                  website: state.resumeBuilder.data.personalInfo.website,
                },
                summary: state.resumeBuilder.data.personalInfo.summary,
                skills: {
                  skills: state.resumeBuilder.data.skills.reduce(
                    (acc, skill) => {
                      if (!acc[skill.category]) acc[skill.category] = [];
                      acc[skill.category].push(skill.name);
                      return acc;
                    },
                    {} as Record<string, string[]>
                  ),
                },
                experience: state.resumeBuilder.data.experience.map((exp) => ({
                  company: exp.company,
                  location: exp.location,
                  title: exp.jobTitle,
                  startDate: exp.startDate,
                  endDate: exp.endDate,
                  descriptions: exp.description,
                })),
                education: state.resumeBuilder.data.education.map((edu) => ({
                  degree: edu.degree,
                  institution: edu.institution,
                  location: edu.location,
                  startDate: edu.graduationDate, // Assuming graduationDate as endDate
                  endDate: edu.graduationDate,
                })),
              };
              await updateResume(state.currentResumeId, apiData);
              // Mark as not dirty once saved
              set((state) => ({
                resumeBuilder: { ...state.resumeBuilder, isDirty: false },
              }));
            } catch (error) {
              console.error("Failed to save resume to API", error);
            }
          }
        },
        setResumeStep: (step) =>
          set((state) => ({
            resumeBuilder: { ...state.resumeBuilder, currentStep: step },
          })),

        setCareerField: (careerField) =>
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: { ...state.resumeBuilder.data, careerField },
              isDirty: true,
            },
          })),

        updatePersonalInfo: (info) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                personalInfo: {
                  ...state.resumeBuilder.data.personalInfo,
                  ...info,
                },
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        addExperience: (experience) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                experience: [
                  ...state.resumeBuilder.data.experience,
                  { ...experience, id: crypto.randomUUID() },
                ],
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        updateExperience: (id, experience) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                experience: state.resumeBuilder.data.experience.map((exp) =>
                  exp.id === id ? { ...exp, ...experience } : exp
                ),
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        removeExperience: (id) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                experience: state.resumeBuilder.data.experience.filter(
                  (exp) => exp.id !== id
                ),
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        addEducation: (education) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                education: [
                  ...state.resumeBuilder.data.education,
                  { ...education, id: crypto.randomUUID() },
                ],
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        updateEducation: (id, education) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                education: state.resumeBuilder.data.education.map((edu) =>
                  edu.id === id ? { ...edu, ...education } : edu
                ),
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        removeEducation: (id) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                education: state.resumeBuilder.data.education.filter(
                  (edu) => edu.id !== id
                ),
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        addSkill: (skill) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                skills: [
                  ...state.resumeBuilder.data.skills,
                  { ...skill, id: crypto.randomUUID() },
                ],
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        removeSkill: (id) => {
          set((state) => {
            const currentSkills = state.resumeBuilder.data.skills || [];
            const filteredSkills = currentSkills.filter(
              (skill) => skill && skill.id !== id
            );

            return {
              resumeBuilder: {
                ...state.resumeBuilder,
                data: {
                  ...state.resumeBuilder.data,
                  skills: filteredSkills,
                },
                isDirty: true,
              },
            };
          });
          get().saveResumeToAPI();
        },

        addCustomField: (field) => {
          set((state) => {
            const fieldWithOptionalId = field as Partial<CustomField> &
              Omit<CustomField, "id">;
            const fieldId = fieldWithOptionalId.id || crypto.randomUUID();

            return {
              resumeBuilder: {
                ...state.resumeBuilder,
                data: {
                  ...state.resumeBuilder.data,
                  customFields: [
                    ...(state.resumeBuilder.data.customFields || []),
                    {
                      id: fieldId,
                      name: field.name,
                      type: field.type,
                      enabled: field.enabled,
                      value:
                        fieldWithOptionalId.value !== undefined
                          ? fieldWithOptionalId.value
                          : "",
                    },
                  ],
                },
                isDirty: true,
              },
            };
          });
          get().saveResumeToAPI();
        },

        updateCustomField: (id, field) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                customFields: (state.resumeBuilder.data.customFields || []).map(
                  (f) => (f.id === id ? { ...f, ...field } : f)
                ),
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        removeCustomField: (id) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                customFields: (
                  state.resumeBuilder.data.customFields || []
                ).filter((f) => f.id !== id),
              },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

        addDynamicSection: (section) =>
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                dynamicSections: [
                  ...(state.resumeBuilder.data.dynamicSections || []),
                  {
                    ...section,
                    id: (section as any).id || crypto.randomUUID(),
                  },
                ],
              },
              isDirty: true,
            },
          })),

        updateDynamicSection: (id, section) =>
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                dynamicSections: (
                  state.resumeBuilder.data.dynamicSections || []
                ).map((s) => (s.id === id ? { ...s, ...section } : s)),
              },
              isDirty: true,
            },
          })),

        removeDynamicSection: (id) =>
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                dynamicSections: (
                  state.resumeBuilder.data.dynamicSections || []
                ).filter((s) => s.id !== id),
              },
              isDirty: true,
            },
          })),

        addDynamicSectionEntry: (sectionId, entry) =>
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                dynamicSections: (
                  state.resumeBuilder.data.dynamicSections || []
                ).map((s) =>
                  s.id === sectionId
                    ? {
                      ...s,
                      entries: [
                        ...s.entries,
                        { ...entry, id: entry.id || crypto.randomUUID() },
                      ],
                    }
                    : s
                ),
              },
              isDirty: true,
            },
          })),

        updateDynamicSectionEntry: (sectionId, entryId, entry) =>
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                dynamicSections: (
                  state.resumeBuilder.data.dynamicSections || []
                ).map((s) =>
                  s.id === sectionId
                    ? {
                      ...s,
                      entries: s.entries.map((e) =>
                        e.id === entryId ? { ...e, ...entry } : e
                      ),
                    }
                    : s
                ),
              },
              isDirty: true,
            },
          })),

        removeDynamicSectionEntry: (sectionId, entryId) =>
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: {
                ...state.resumeBuilder.data,
                dynamicSections: (
                  state.resumeBuilder.data.dynamicSections || []
                ).map((s) =>
                  s.id === sectionId
                    ? {
                      ...s,
                      entries: s.entries.filter((e) => e.id !== entryId),
                    }
                    : s
                ),
              },
              isDirty: true,
            },
          })),

        setResumeTemplate: (template) =>
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: { ...state.resumeBuilder.data, template },
              isDirty: true,
            },
          })),

        setResumeLoading: (loading) =>
          set((state) => ({
            resumeBuilder: { ...state.resumeBuilder, isLoading: loading },
          })),

        resetResumeBuilder: () =>
          set(() => ({
            resumeBuilder: {
              currentStep: 1,
              data: initialResumeData,
              isLoading: false,
              isDirty: false,
            },
          })),

        populateWithDummyContent: (careerField) =>
          set((state) => {
            // Determine experience level based on existing data or default to 'mid'
            const experienceLevel =
              state.resumeBuilder.data.experience.length === 0
                ? "fresher"
                : "mid";

            // Generate dummy content
            const dummyContent = generateDummyContent(
              careerField,
              experienceLevel
            );

            return {
              resumeBuilder: {
                ...state.resumeBuilder,
                data: {
                  careerField,
                  personalInfo: dummyContent.personalInfo,
                  experience: dummyContent.experience.map((exp, index) => ({
                    ...exp,
                    id: `exp-${Date.now()}-${index}`,
                  })),
                  education: dummyContent.education.map((edu, index) => ({
                    ...edu,
                    id: `edu-${Date.now()}-${index}`,
                  })),
                  skills: dummyContent.skills.map((skill, index) => ({
                    ...skill,
                    id: `skill-${Date.now()}-${index}`,
                  })),
                  template: state.resumeBuilder.data.template,
                },
                isDirty: true,
              },
            };
          }),

        // Navigation
        sidebarCollapsed: false,
        toggleSidebar: () =>
          set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

        // Settings
        platformFee: 15, // Default value
        setPlatformFee: (fee) => set({ platformFee: fee }),
        fetchSettings: async () => {
          try {
            const response = await fetch("/api/admin/settings");
            if (response.ok) {
              const data = await response.json();
              if (typeof data.platformFee === "number") {
                set({ platformFee: data.platformFee });
              }
            }
          } catch (error) {
            console.error("Failed to fetch settings:", error);
          }
        },
      }),
      {
        name: "timcare-global-store",
        partialize: (state) => ({
          theme: state.theme,
          language: state.language,
          user: state.user,
          resumeBuilder: {
            data: state.resumeBuilder.data,
            currentStep: state.resumeBuilder.currentStep,
          },
        }),
      }
    ),
    { name: "TimCareGlobalStore" }
  )
);
