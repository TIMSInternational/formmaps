import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { generateDummyContent } from "@/lib/dummyContentGenerator";
import { updateResume, getResumeById } from "@/services/resumeService";
import { toApiResume } from "@/services/resumeSerialization";
import { telemetry } from "@/services/telemetryService";
import { logout as apiLogout } from "@/services/authService";
import { resetClientState } from "@/lib/resetClientState";

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

/** One in-place edit to the original PDF, located by page + run index. */
export interface DocumentEdit {
  page: number;
  runIndex: number;
  orig: string;
  text: string;
}

export interface ResumeData {
  careerField: string;
  /** In-place edits to the original-PDF document (free-form + bound fields). */
  documentEdits?: DocumentEdit[];
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
    permissions?: string[];
    accessToken?: string | null;
    isAuthenticated: boolean;
  };
  setUser: (user: Partial<GlobalState["user"]>) => void;
  setPermissions: (permissions: string[]) => void;
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
  setDocumentEdits: (edits: DocumentEdit[]) => void;
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

  // Assessment in-progress flag (transient, not persisted). True while a student
  // is actively taking a PCA survey or LIA/MIL exam — used to block/close the AI chat.
  assessmentActive: boolean;
  setAssessmentActive: (active: boolean) => void;

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
          permissions: [],
          isAuthenticated: false,
        },
        setUser: (userData) => {
          set((state) => ({
            user: { ...state.user, ...userData, isAuthenticated: true },
          }))
        },
        setPermissions: (permissions) =>
          set((state) => ({
            user: { ...state.user, permissions },
          })),
        logout: () => {
          // Track logout event
          telemetry.trackAuth("logout");
          // Sign out + clear tokens (httpOnly cookies cleared by backend)
          apiLogout().catch(() => {});
          // Wipe ALL user-scoped client state (React Query cache + every
          // non-allowlisted localStorage/sessionStorage key, including the
          // persisted store's stale identity) so nothing leaks into the next
          // account on a shared browser.
          resetClientState();
          // Reset user state
          set({
            user: {
              id: null,
              email: null,
              name: null,
              role: null,
              image: null,
              avatar: null,
              permissions: [],
              accessToken: null,
              isAuthenticated: false,
            },
          });
        },

        // Initialize authentication state from cookie OR persisted token
        initializeAuth: async () => {
          if (typeof window === "undefined") return;

          const loggedIn = document.cookie.includes("logged_in=true");
          const currentUser = get().user;

          if ((loggedIn || currentUser.accessToken) && currentUser.email) {
            // Cookie or token present and we have persisted user data — restore session
            set((state) => ({
              user: { ...state.user, isAuthenticated: true },
            }));
            telemetry.trackAuth("login", "session_restore");
          } else {
            // Not logged in or no user data — reset
            set({
              user: {
                id: null,
                email: null,
                name: null,
                role: null,
                image: null,
                avatar: null,
                accessToken: null,
                isAuthenticated: false,
              },
            });
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
              // Serialize through the single source of truth so the payload
              // matches the backend column contract (personalInfo + flat skills).
              const apiData = toApiResume(state.resumeBuilder.data);
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

        setDocumentEdits: (edits) => {
          set((state) => ({
            resumeBuilder: {
              ...state.resumeBuilder,
              data: { ...state.resumeBuilder.data, documentEdits: edits },
              isDirty: true,
            },
          }));
          get().saveResumeToAPI();
        },

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

        // Assessment in-progress flag (transient; excluded from persist partialize)
        assessmentActive: false,
        setAssessmentActive: (active: boolean) => set({ assessmentActive: active }),

        // Settings
        platformFee: 15, // Default value
        setPlatformFee: (fee) => set({ platformFee: fee }),
        fetchSettings: async () => {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
            if (typeof window === "undefined") return;
            const response = await fetch(`${baseUrl}/api/v1/admin/settings`, {
              credentials: "include",
            });
            if (response.ok) {
              const json = await response.json();
              const data = json?.data ?? json;
              if (typeof data.platformFee === "number") {
                set({ platformFee: data.platformFee });
              }
            }
          } catch {
            // Settings fetch is best-effort — non-admin roles won't have access
          }
        },
      }),
      {
        name: "timcare-global-store",
        partialize: (state) => ({
          theme: state.theme,
          language: state.language,
          user: state.user,
          // NOTE: Do NOT persist resumeBuilder.data — it's always loaded
          // fresh from the API via getResumeById. Persisting it causes a
          // race condition where rehydration overwrites API data.
          currentResumeId: state.currentResumeId,
        }),
      }
    ),
    { name: "TimCareGlobalStore" }
  )
);
