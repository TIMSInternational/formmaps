import {
  User,
  GraduationCap,
  Briefcase,
  Target,
  Globe,
  Award,
  Palette,
  Folder,
  Book,
  Trophy,
  Building,
  Newspaper,
  Star,
  Pen,
  Layers,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ResumeData } from "@/store/useGlobalStore";

export type SectionType =
  | "profile"
  | "education"
  | "experience"
  | "skills"
  | "languages"
  | "certificates"
  | "interests"
  | "projects"
  | "courses"
  | "awards"
  | "organisations"
  | "publications"
  | "references"
  | "declaration"
  | "custom";

export const SECTION_ICON_MAP: Record<SectionType, LucideIcon> = {
  profile: User,
  education: GraduationCap,
  experience: Briefcase,
  skills: Target,
  languages: Globe,
  certificates: Award,
  interests: Palette,
  projects: Folder,
  courses: Book,
  awards: Trophy,
  organisations: Building,
  publications: Newspaper,
  references: Star,
  declaration: Pen,
  custom: Layers,
};

export const getSectionIcon = (type: string): LucideIcon => {
  if (type in SECTION_ICON_MAP) {
    return SECTION_ICON_MAP[type as SectionType];
  }

  return Layers;
};

export const PERSONAL_INFO_FORM_TEMPLATE = {
  fullName: "",
  professionalTitle: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  website: "",
  github: "",
  twitter: "",
  dateOfBirth: "",
  nationality: "",
  languages: "",
  maritalStatus: "",
  driversLicense: "",
  militaryService: "",
  visaStatus: "",
  preferredPronouns: "",
  summary: "",
  careerObjective: "",
};

export type PersonalInfoFormTemplate = typeof PERSONAL_INFO_FORM_TEMPLATE;
export type PersonalInfoFormState = PersonalInfoFormTemplate &
  Record<string, string>;

export const hasMeaningfulResumeData = (
  data?: ResumeData | null
): boolean => {
  if (!data) {
    return false;
  }

  const hasPersonalInfo = data.personalInfo
    ? Object.values(data.personalInfo).some((value) => {
        if (typeof value === "string") {
          return value.trim().length > 0;
        }

        if (Array.isArray(value)) {
          return value.some((entry) =>
            typeof entry === "string" ? entry.trim().length > 0 : Boolean(entry)
          );
        }

        return Boolean(value);
      })
    : false;

  const hasExperience =
    Array.isArray(data.experience) && data.experience.length > 0;
  const hasEducation =
    Array.isArray(data.education) && data.education.length > 0;
  const hasSkills = Array.isArray(data.skills) && data.skills.length > 0;
  const hasDynamicEntries = Array.isArray(data.dynamicSections)
    ? data.dynamicSections.some((section) => section.entries.length > 0)
    : false;

  return (
    hasPersonalInfo ||
    hasExperience ||
    hasEducation ||
    hasSkills ||
    hasDynamicEntries
  );
};

export interface Entry {
  id: string;
  [key: string]: any;
}

export interface Section {
  id: string;
  type: SectionType;
  title: string;
  icon: any;
  isExpanded: boolean;
  entries: Entry[];
}

// Template data for template selection
export const TEMPLATES = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional resume layout with timeless design",
  },
];

export const AVAILABLE_SECTIONS = [
  {
    type: "education" as SectionType,
    title: "Education",
    icon: GraduationCap,
    description:
      "Show off your primary education, college degrees & exchange semesters.",
  },
  {
    type: "experience" as SectionType,
    title: "Professional Experience",
    icon: Briefcase,
    description:
      "A place to highlight your professional experience - including internships.",
  },
  {
    type: "skills" as SectionType,
    title: "Skills",
    icon: Target,
    description:
      "List your technical, managerial or soft skills in this section.",
  },
  {
    type: "languages" as SectionType,
    title: "Languages",
    icon: Globe,
    description:
      "You speak more than one language? Make sure to list them here.",
  },
  {
    type: "certificates" as SectionType,
    title: "Certificates",
    icon: Award,
    description:
      "Drivers licenses and industry-specific certificates you have belong here.",
  },
  {
    type: "interests" as SectionType,
    title: "Interests",
    icon: Palette,
    description:
      "Do you have interests that align with your career aspiration?",
  },
  {
    type: "projects" as SectionType,
    title: "Projects",
    icon: Folder,
    description:
      "Worked on a particular challenging project in the past? Mention it here.",
  },
  {
    type: "courses" as SectionType,
    title: "Courses",
    icon: Book,
    description:
      "Did you complete MOOCs or an evening course? Show them off in this section.",
  },
  {
    type: "awards" as SectionType,
    title: "Awards",
    icon: Trophy,
    description:
      "Awards like student competitions or industry accolades belong here.",
  },
  {
    type: "organisations" as SectionType,
    title: "Organisations",
    icon: Building,
    description:
      "If you volunteer or participate in a good cause, why not state it?",
  },
  {
    type: "publications" as SectionType,
    title: "Publications",
    icon: Newspaper,
    description:
      "Academic publications or book releases have a dedicated place here.",
  },
  {
    type: "references" as SectionType,
    title: "References",
    icon: Star,
    description:
      "If you have former colleagues or bosses that vouch for you, list them.",
  },
  {
    type: "declaration" as SectionType,
    title: "Declaration",
    icon: Pen,
    description: "You need a declaration with signature?",
  },
  {
    type: "custom" as SectionType,
    title: "Custom",
    icon: Plus,
    description:
      "You didn't find what you are looking for? Or you want to combine two sections to save space?",
  },
];

// Field configurations for each section type
export const SECTION_FIELD_CONFIGS: Record<
  SectionType,
  Array<{
    name: string;
    label: string;
    type: "text" | "textarea" | "date" | "select";
    placeholder?: string;
    options?: string[];
    required?: boolean;
  }>
> = {
  profile: [], // Handled separately (Personal Info section)
  education: [], // Handled separately with dedicated inline form
  experience: [], // Handled separately with dedicated inline form
  skills: [], // Handled separately with dedicated inline form
  languages: [
    {
      name: "language",
      label: "Language",
      type: "text",
      placeholder: "e.g., English, Spanish, French",
      required: true,
    },
    {
      name: "proficiency",
      label: "Proficiency Level",
      type: "select",
      options: ["Native", "Fluent", "Advanced", "Intermediate", "Basic"],
      required: true,
    },
  ],
  certificates: [
    {
      name: "name",
      label: "Certificate Name",
      type: "text",
      placeholder: "e.g., AWS Certified Solutions Architect",
      required: true,
    },
    {
      name: "issuer",
      label: "Issuing Organization",
      type: "text",
      placeholder: "e.g., Amazon Web Services",
    },
    {
      name: "date",
      label: "Issue Date",
      type: "text",
      placeholder: "e.g., Jan 2024",
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "Brief description of the certificate...",
    },
  ],
  interests: [
    {
      name: "interest",
      label: "Interest",
      type: "text",
      placeholder: "e.g., Photography, Hiking, Open Source",
      required: true,
    },
    {
      name: "description",
      label: "Description (Optional)",
      type: "textarea",
      placeholder: "Brief description...",
    },
  ],
  projects: [
    {
      name: "title",
      label: "Project Title",
      type: "text",
      placeholder: "e.g., E-commerce Platform",
      required: true,
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "Describe the project, your role, and achievements...",
      required: true,
    },
    {
      name: "technologies",
      label: "Technologies Used",
      type: "text",
      placeholder: "e.g., React, Node.js, MongoDB",
    },
    {
      name: "link",
      label: "Project Link (Optional)",
      type: "text",
      placeholder: "https://github.com/username/project",
    },
    {
      name: "date",
      label: "Date",
      type: "text",
      placeholder: "e.g., Jan 2024 - Mar 2024",
    },
  ],
  courses: [
    {
      name: "name",
      label: "Course Name",
      type: "text",
      placeholder: "e.g., Machine Learning Specialization",
      required: true,
    },
    {
      name: "institution",
      label: "Institution/Platform",
      type: "text",
      placeholder: "e.g., Coursera, Udemy",
    },
    {
      name: "date",
      label: "Completion Date",
      type: "text",
      placeholder: "e.g., Mar 2024",
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "What you learned...",
    },
  ],
  awards: [
    {
      name: "title",
      label: "Award Title",
      type: "text",
      placeholder: "e.g., Employee of the Year",
      required: true,
    },
    {
      name: "issuer",
      label: "Issued By",
      type: "text",
      placeholder: "e.g., Company Name",
    },
    {
      name: "date",
      label: "Date Received",
      type: "text",
      placeholder: "e.g., Dec 2023",
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "Details about the award...",
    },
  ],
  organisations: [
    {
      name: "name",
      label: "Organization Name",
      type: "text",
      placeholder: "e.g., Red Cross",
      required: true,
    },
    {
      name: "role",
      label: "Your Role",
      type: "text",
      placeholder: "e.g., Volunteer Coordinator",
    },
    {
      name: "startDate",
      label: "Start Date",
      type: "text",
      placeholder: "e.g., Jan 2022",
    },
    {
      name: "endDate",
      label: "End Date",
      type: "text",
      placeholder: "e.g., Present",
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "Describe your involvement and contributions...",
    },
  ],
  publications: [
    {
      name: "title",
      label: "Publication Title",
      type: "text",
      placeholder: "e.g., Research Paper Title",
      required: true,
    },
    {
      name: "publisher",
      label: "Publisher/Journal",
      type: "text",
      placeholder: "e.g., IEEE, Nature",
    },
    {
      name: "date",
      label: "Publication Date",
      type: "text",
      placeholder: "e.g., Mar 2024",
    },
    {
      name: "authors",
      label: "Authors",
      type: "text",
      placeholder: "e.g., John Doe, Jane Smith",
    },
    {
      name: "link",
      label: "Link (Optional)",
      type: "text",
      placeholder: "https://doi.org/...",
    },
  ],
  references: [
    {
      name: "name",
      label: "Reference Name",
      type: "text",
      placeholder: "e.g., John Doe",
      required: true,
    },
    {
      name: "position",
      label: "Position/Title",
      type: "text",
      placeholder: "e.g., Senior Manager",
    },
    {
      name: "company",
      label: "Company",
      type: "text",
      placeholder: "e.g., Tech Corp",
    },
    {
      name: "email",
      label: "Email",
      type: "text",
      placeholder: "john.doe@example.com",
    },
    {
      name: "phone",
      label: "Phone",
      type: "text",
      placeholder: "+1 (555) 123-4567",
    },
  ],
  declaration: [
    {
      name: "text",
      label: "Declaration Text",
      type: "textarea",
      placeholder:
        "I hereby declare that the information provided is true and correct to the best of my knowledge.",
      required: true,
    },
    {
      name: "place",
      label: "Place",
      type: "text",
      placeholder: "e.g., New York",
    },
    {
      name: "date",
      label: "Date",
      type: "text",
      placeholder: "e.g., January 15, 2024",
    },
  ],
  custom: [
    {
      name: "title",
      label: "Title",
      type: "text",
      placeholder: "Entry title",
      required: true,
    },
    {
      name: "content",
      label: "Content",
      type: "textarea",
      placeholder: "Enter content...",
      required: true,
    },
  ],
};

export type SectionFieldConfig = (typeof SECTION_FIELD_CONFIGS)[SectionType][number];

// Helper: determine AI field type based on section type and field name
export type AIFieldTypeMapping =
  | "project_description"
  | "course_description"
  | "award_description"
  | "organization_description"
  | "publication_description"
  | "language_description"
  | "declaration_text"
  | "custom_description"
  | "custom_bullets";

export const getAIFieldType = (
  sectionType: SectionType,
  fieldName: string
): AIFieldTypeMapping | null => {
  if (fieldName === "description") {
    switch (sectionType) {
      case "projects":
        return "project_description";
      case "courses":
        return "course_description";
      case "awards":
        return "award_description";
      case "organisations":
        return "organization_description";
      case "publications":
        return "publication_description";
      case "languages":
        return "language_description";
      default:
        return null;
    }
  }

  if (fieldName === "text" && sectionType === "declaration") {
    return "declaration_text";
  }

  return null;
};

// Helper: build context for AI generation
export const buildAIContext = (
  sectionType: SectionType,
  _fieldName: string,
  formData: Record<string, string>,
  personalInfo?: { fullName?: string; location?: string }
): Record<string, string> => {
  switch (sectionType) {
    case "projects":
      return {
        project_name: formData.title || "",
        technologies: formData.technologies || "",
        role: formData.role || "",
        description: formData.description || "",
        impact: formData.impact || "",
      };
    case "courses":
      return {
        course_name: formData.name || "",
        provider: formData.institution || "",
        skills_learned: formData.skills_learned || "",
        projects: formData.projects || "",
      };
    case "awards":
      return {
        award_name: formData.title || "",
        organization: formData.issuer || "",
        reason: formData.reason || "",
        impact: formData.impact || "",
      };
    case "organisations":
      return {
        organization_name: formData.name || "",
        role: formData.role || "",
        activities: formData.activities || "",
        achievements: formData.achievements || "",
      };
    case "publications":
      return {
        title: formData.title || "",
        publisher: formData.publisher || "",
        topic: formData.topic || "",
        impact: formData.impact || "",
      };
    case "languages":
      return {
        language: formData.language || "",
        proficiency: formData.proficiency || "",
        context: formData.context || "",
      };
    case "declaration":
      return {
        name: personalInfo?.fullName || "",
        location: personalInfo?.location || "",
      };
    default:
      return {};
  }
};
