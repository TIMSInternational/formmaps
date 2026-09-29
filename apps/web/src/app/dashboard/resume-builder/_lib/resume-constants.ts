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
import i18n from "@/lib/i18n";

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
    get name() {
      return i18n.t("resumeBuilder.templateInfo.classic.shortName", "Classic");
    },
    get description() {
      return i18n.t("resumeBuilder.templateInfo.classic.shortDescription", "Traditional resume layout with timeless design");
    },
  },
];

export const AVAILABLE_SECTIONS = [
  {
    type: "education" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.education.title", "Education");
    },
    icon: GraduationCap,
    get description() {
      return i18n.t("resumeBuilder.sections.education.description", "Show off your primary education, college degrees & exchange semesters.");
    },
  },
  {
    type: "experience" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.experience.title", "Professional Experience");
    },
    icon: Briefcase,
    get description() {
      return i18n.t("resumeBuilder.sections.experience.description", "A place to highlight your professional experience - including internships.");
    },
  },
  {
    type: "skills" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.skills.title", "Skills");
    },
    icon: Target,
    get description() {
      return i18n.t("resumeBuilder.sections.skills.description", "List your technical, managerial or soft skills in this section.");
    },
  },
  {
    type: "languages" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.languages.title", "Languages");
    },
    icon: Globe,
    get description() {
      return i18n.t("resumeBuilder.sections.languages.description", "Do you speak more than one language? Make sure to list them here.");
    },
  },
  {
    type: "certificates" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.certificates.title", "Certificates");
    },
    icon: Award,
    get description() {
      return i18n.t("resumeBuilder.sections.certificates.description", "Driver's licenses and industry-specific certificates you have belong here.");
    },
  },
  {
    type: "interests" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.interests.title", "Interests");
    },
    icon: Palette,
    get description() {
      return i18n.t("resumeBuilder.sections.interests.description", "Do you have interests that align with your career aspiration?");
    },
  },
  {
    type: "projects" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.projects.title", "Projects");
    },
    icon: Folder,
    get description() {
      return i18n.t("resumeBuilder.sections.projects.description", "Worked on a particularly challenging project in the past? Mention it here.");
    },
  },
  {
    type: "courses" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.courses.title", "Courses");
    },
    icon: Book,
    get description() {
      return i18n.t("resumeBuilder.sections.courses.description", "Did you complete MOOCs or an evening course? Show them off in this section.");
    },
  },
  {
    type: "awards" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.awards.title", "Awards");
    },
    icon: Trophy,
    get description() {
      return i18n.t("resumeBuilder.sections.awards.description", "Awards like student competitions or industry accolades belong here.");
    },
  },
  {
    type: "organisations" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.organisations.title", "Organizations");
    },
    icon: Building,
    get description() {
      return i18n.t("resumeBuilder.sections.organisations.description", "If you volunteer or participate in a good cause, why not state it?");
    },
  },
  {
    type: "publications" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.publications.title", "Publications");
    },
    icon: Newspaper,
    get description() {
      return i18n.t("resumeBuilder.sections.publications.description", "Academic publications or book releases have a dedicated place here.");
    },
  },
  {
    type: "references" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.references.title", "References");
    },
    icon: Star,
    get description() {
      return i18n.t("resumeBuilder.sections.references.description", "If you have former colleagues or bosses who vouch for you, list them.");
    },
  },
  {
    type: "declaration" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.declaration.title", "Declaration");
    },
    icon: Pen,
    get description() {
      return i18n.t("resumeBuilder.sections.declaration.description", "Do you need a signed declaration?");
    },
  },
  {
    type: "custom" as SectionType,
    get title() {
      return i18n.t("resumeBuilder.sections.custom.title", "Custom");
    },
    icon: Plus,
    get description() {
      return i18n.t("resumeBuilder.sections.custom.description", "Didn't find what you're looking for? Or want to combine two sections to save space?");
    },
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
      get label() {
        return i18n.t("resumeBuilder.fields.languages.language.label", "Language");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.languages.language.placeholder", "e.g., English, Spanish, French");
      },
      required: true,
    },
    {
      name: "proficiency",
      get label() {
        return i18n.t("resumeBuilder.fields.languages.proficiency.label", "Proficiency Level");
      },
      type: "select",
      options: ["Native", "Fluent", "Advanced", "Intermediate", "Basic"],
      required: true,
    },
  ],
  certificates: [
    {
      name: "name",
      get label() {
        return i18n.t("resumeBuilder.fields.certificates.name.label", "Certificate Name");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.certificates.name.placeholder", "e.g., AWS Certified Solutions Architect");
      },
      required: true,
    },
    {
      name: "issuer",
      get label() {
        return i18n.t("resumeBuilder.fields.certificates.issuer.label", "Issuing Organization");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.certificates.issuer.placeholder", "e.g., Amazon Web Services");
      },
    },
    {
      name: "date",
      get label() {
        return i18n.t("resumeBuilder.fields.certificates.date.label", "Issue Date");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.certificates.date.placeholder", "e.g., Jan 2024");
      },
    },
    {
      name: "description",
      get label() {
        return i18n.t("resumeBuilder.fields.certificates.description.label", "Description");
      },
      type: "textarea",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.certificates.description.placeholder", "Brief description of the certificate...");
      },
    },
  ],
  interests: [
    {
      name: "interest",
      get label() {
        return i18n.t("resumeBuilder.fields.interests.interest.label", "Interest");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.interests.interest.placeholder", "e.g., Photography, Hiking, Open Source");
      },
      required: true,
    },
    {
      name: "description",
      get label() {
        return i18n.t("resumeBuilder.fields.interests.description.label", "Description (Optional)");
      },
      type: "textarea",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.interests.description.placeholder", "Brief description...");
      },
    },
  ],
  projects: [
    {
      name: "title",
      get label() {
        return i18n.t("resumeBuilder.fields.projects.title.label", "Project Title");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.projects.title.placeholder", "e.g., E-commerce Platform");
      },
      required: true,
    },
    {
      name: "description",
      get label() {
        return i18n.t("resumeBuilder.fields.projects.description.label", "Description");
      },
      type: "textarea",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.projects.description.placeholder", "Describe the project, your role, and achievements...");
      },
      required: true,
    },
    {
      name: "technologies",
      get label() {
        return i18n.t("resumeBuilder.fields.projects.technologies.label", "Technologies Used");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.projects.technologies.placeholder", "e.g., React, Node.js, MongoDB");
      },
    },
    {
      name: "link",
      get label() {
        return i18n.t("resumeBuilder.fields.projects.link.label", "Project Link (Optional)");
      },
      type: "text",
      placeholder: "https://github.com/username/project",
    },
    {
      name: "date",
      get label() {
        return i18n.t("resumeBuilder.fields.projects.date.label", "Date");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.projects.date.placeholder", "e.g., Jan 2024 - Mar 2024");
      },
    },
  ],
  courses: [
    {
      name: "name",
      get label() {
        return i18n.t("resumeBuilder.fields.courses.name.label", "Course Name");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.courses.name.placeholder", "e.g., Machine Learning Specialization");
      },
      required: true,
    },
    {
      name: "institution",
      get label() {
        return i18n.t("resumeBuilder.fields.courses.institution.label", "Institution/Platform");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.courses.institution.placeholder", "e.g., Coursera, Udemy");
      },
    },
    {
      name: "date",
      get label() {
        return i18n.t("resumeBuilder.fields.courses.date.label", "Completion Date");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.courses.date.placeholder", "e.g., Mar 2024");
      },
    },
    {
      name: "description",
      get label() {
        return i18n.t("resumeBuilder.fields.courses.description.label", "Description");
      },
      type: "textarea",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.courses.description.placeholder", "What you learned...");
      },
    },
  ],
  awards: [
    {
      name: "title",
      get label() {
        return i18n.t("resumeBuilder.fields.awards.title.label", "Award Title");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.awards.title.placeholder", "e.g., Employee of the Year");
      },
      required: true,
    },
    {
      name: "issuer",
      get label() {
        return i18n.t("resumeBuilder.fields.awards.issuer.label", "Issued By");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.awards.issuer.placeholder", "e.g., Company Name");
      },
    },
    {
      name: "date",
      get label() {
        return i18n.t("resumeBuilder.fields.awards.date.label", "Date Received");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.awards.date.placeholder", "e.g., Dec 2023");
      },
    },
    {
      name: "description",
      get label() {
        return i18n.t("resumeBuilder.fields.awards.description.label", "Description");
      },
      type: "textarea",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.awards.description.placeholder", "Details about the award...");
      },
    },
  ],
  organisations: [
    {
      name: "name",
      get label() {
        return i18n.t("resumeBuilder.fields.organisations.name.label", "Organization Name");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.organisations.name.placeholder", "e.g., Red Cross");
      },
      required: true,
    },
    {
      name: "role",
      get label() {
        return i18n.t("resumeBuilder.fields.organisations.role.label", "Your Role");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.organisations.role.placeholder", "e.g., Volunteer Coordinator");
      },
    },
    {
      name: "startDate",
      get label() {
        return i18n.t("resumeBuilder.fields.organisations.startDate.label", "Start Date");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.organisations.startDate.placeholder", "e.g., Jan 2022");
      },
    },
    {
      name: "endDate",
      get label() {
        return i18n.t("resumeBuilder.fields.organisations.endDate.label", "End Date");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.organisations.endDate.placeholder", "e.g., Present");
      },
    },
    {
      name: "description",
      get label() {
        return i18n.t("resumeBuilder.fields.organisations.description.label", "Description");
      },
      type: "textarea",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.organisations.description.placeholder", "Describe your involvement and contributions...");
      },
    },
  ],
  publications: [
    {
      name: "title",
      get label() {
        return i18n.t("resumeBuilder.fields.publications.title.label", "Publication Title");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.publications.title.placeholder", "e.g., Research Paper Title");
      },
      required: true,
    },
    {
      name: "publisher",
      get label() {
        return i18n.t("resumeBuilder.fields.publications.publisher.label", "Publisher/Journal");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.publications.publisher.placeholder", "e.g., IEEE, Nature");
      },
    },
    {
      name: "date",
      get label() {
        return i18n.t("resumeBuilder.fields.publications.date.label", "Publication Date");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.publications.date.placeholder", "e.g., Mar 2024");
      },
    },
    {
      name: "authors",
      get label() {
        return i18n.t("resumeBuilder.fields.publications.authors.label", "Authors");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.publications.authors.placeholder", "e.g., John Doe, Jane Smith");
      },
    },
    {
      name: "link",
      get label() {
        return i18n.t("resumeBuilder.fields.publications.link.label", "Link (Optional)");
      },
      type: "text",
      placeholder: "https://doi.org/...",
    },
  ],
  references: [
    {
      name: "name",
      get label() {
        return i18n.t("resumeBuilder.fields.references.name.label", "Reference Name");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.references.name.placeholder", "e.g., John Doe");
      },
      required: true,
    },
    {
      name: "position",
      get label() {
        return i18n.t("resumeBuilder.fields.references.position.label", "Position/Title");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.references.position.placeholder", "e.g., Senior Manager");
      },
    },
    {
      name: "company",
      get label() {
        return i18n.t("resumeBuilder.fields.references.company.label", "Company");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.references.company.placeholder", "e.g., Tech Corp");
      },
    },
    {
      name: "email",
      get label() {
        return i18n.t("resumeBuilder.fields.references.email.label", "Email");
      },
      type: "text",
      placeholder: "john.doe@example.com",
    },
    {
      name: "phone",
      get label() {
        return i18n.t("resumeBuilder.fields.references.phone.label", "Phone");
      },
      type: "text",
      placeholder: "+1 (555) 123-4567",
    },
  ],
  declaration: [
    {
      name: "text",
      get label() {
        return i18n.t("resumeBuilder.fields.declaration.text.label", "Declaration Text");
      },
      type: "textarea",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.declaration.text.placeholder", "I hereby declare that the information provided is true and correct to the best of my knowledge.");
      },
      required: true,
    },
    {
      name: "place",
      get label() {
        return i18n.t("resumeBuilder.fields.declaration.place.label", "Place");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.declaration.place.placeholder", "e.g., New York");
      },
    },
    {
      name: "date",
      get label() {
        return i18n.t("resumeBuilder.fields.declaration.date.label", "Date");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.declaration.date.placeholder", "e.g., January 15, 2024");
      },
    },
  ],
  custom: [
    {
      name: "title",
      get label() {
        return i18n.t("resumeBuilder.fields.custom.title.label", "Title");
      },
      type: "text",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.custom.title.placeholder", "Entry title");
      },
      required: true,
    },
    {
      name: "content",
      get label() {
        return i18n.t("resumeBuilder.fields.custom.content.label", "Content");
      },
      type: "textarea",
      get placeholder() {
        return i18n.t("resumeBuilder.fields.custom.content.placeholder", "Enter content...");
      },
      required: true,
    },
  ],
};

export type SectionFieldConfig = (typeof SECTION_FIELD_CONFIGS)[SectionType][number];

// Language proficiency values are stored in English ("Native", "Fluent", ...).
// Translate them for display only; unknown/free-text values are shown as-is.
const PROFICIENCY_VALUES = ["Native", "Fluent", "Advanced", "Intermediate", "Basic"];
export const translateProficiency = (value: string): string =>
  PROFICIENCY_VALUES.includes(value)
    ? i18n.t(`resumeBuilder.proficiency.${value.toLowerCase()}`, value)
    : value;

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
