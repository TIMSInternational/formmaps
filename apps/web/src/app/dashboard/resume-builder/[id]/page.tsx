"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Trash2,
  Pencil,
  X,
  Sparkles,
  Check,
  Download,
  MoreVertical,
  Plus,
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
  FileText,
  Pen,
  Layers,
  User,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Twitter,
  ExternalLink,
  EyeOff,
  Settings,
  GripVertical,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useGlobalStore } from "@/store/useGlobalStore";
import type { ResumeData } from "@/store/useGlobalStore";
import { LivePreviewPDF } from "../_components/LivePreviewPDF";
import { TemplatePreviewCard } from "../_components/TemplatePreviewCard";
import { cn } from "@/lib/utils";
import { GenerateButton } from "@/components/ai";
import { getResumeById } from "@/services/resumeService";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SectionType =
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

const SECTION_ICON_MAP: Record<SectionType, LucideIcon> = {
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

const getSectionIcon = (type: string): LucideIcon => {
  if (type in SECTION_ICON_MAP) {
    return SECTION_ICON_MAP[type as SectionType];
  }

  return Layers;
};

const PERSONAL_INFO_FORM_TEMPLATE = {
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

type PersonalInfoFormTemplate = typeof PERSONAL_INFO_FORM_TEMPLATE;
type PersonalInfoFormState = PersonalInfoFormTemplate & Record<string, string>;

const hasMeaningfulResumeData = (data?: ResumeData | null): boolean => {
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

interface Entry {
  id: string;
  [key: string]: any;
}

interface Section {
  id: string;
  type: SectionType;
  title: string;
  icon: any;
  isExpanded: boolean;
  entries: Entry[];
}

// Template data for template selection
const TEMPLATES = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional resume layout with timeless design",
  },
];

const AVAILABLE_SECTIONS = [
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
const SECTION_FIELD_CONFIGS: Record<
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

type SectionFieldConfig = (typeof SECTION_FIELD_CONFIGS)[SectionType][number];

// Sortable Section Component
interface SortableSectionProps {
  section: Section;
  index: number;
  toggleSection: (id: string) => void;
  headerMeta?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  editingSectionTitle?: string | null;
  sectionTitleForm?: string;
  onEditTitle?: (sectionId: string, currentTitle: string) => void;
  onSaveTitle?: (sectionId: string) => void;
  onCancelEditTitle?: () => void;
  onTitleChange?: (value: string) => void;
}

function SortableSection({
  section,
  index,
  toggleSection,
  headerMeta,
  headerActions,
  children,
  editingSectionTitle,
  sectionTitleForm,
  onEditTitle,
  onSaveTitle,
  onCancelEditTitle,
  onTitleChange,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms cubic-bezier(0.25, 1, 0.5, 1)",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  };

  const handleSectionToggle = () => {
    toggleSection(section.id);
  };

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSectionToggle();
    }
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * (index + 2) }}
      className={cn(
        "bg-card rounded-xl border overflow-hidden transition-all duration-200",
        isDragging
          ? "border-foreground/20 shadow-lg scale-[1.02]"
          : "border-border hover:border-foreground/10"
      )}
    >
      <div className="group w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/50 transition-colors">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "cursor-grab active:cursor-grabbing p-2 rounded transition-all",
            "hover:bg-primary/10 hover:text-primary",
            "focus:outline-none focus:ring-2 focus:ring-primary/50",
            isDragging && "cursor-grabbing bg-primary/20"
          )}
          title="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Section Header */}
        {editingSectionTitle === section.id ? (
          <div className="flex-1 flex items-center gap-2">
            <section.icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={sectionTitleForm}
              onChange={(e) => onTitleChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSaveTitle?.(section.id);
                } else if (e.key === "Escape") {
                  onCancelEditTitle?.();
                }
              }}
              className="flex-1 px-2 py-1 text-sm font-semibold bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveTitle?.(section.id);
              }}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Save title"
            >
              <Check className="w-4 h-4 text-green-600" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelEditTitle?.();
              }}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-expanded={section.isExpanded}
            onClick={handleSectionToggle}
            onKeyDown={handleHeaderKeyDown}
            className="flex-1 flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <section.icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold text-foreground text-left truncate">
                {section.title}
              </span>
              {section.type === "custom" && onEditTitle && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditTitle(section.id, section.title);
                  }}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-all"
                  title="Edit section title"
                >
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {headerMeta ? (
                <span className="text-xs text-muted-foreground truncate">
                  {headerMeta}
                </span>
              ) : null}
            </div>
            {section.isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        )}

        {headerActions ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerActions}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {section.isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-4 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ResumeBuilderPage() {
  const params = useParams();
  const {
    resumeBuilder,
    updatePersonalInfo,
    populateWithDummyContent,
    addEducation,
    updateEducation,
    removeEducation,
    addExperience,
    updateExperience,
    removeExperience,
    addSkill,
    removeSkill,
    setResumeTemplate,
    addCustomField,
    updateCustomField,
    removeCustomField,
    addDynamicSection,
    updateDynamicSection,
    removeDynamicSection,
    addDynamicSectionEntry,
    updateDynamicSectionEntry,
    removeDynamicSectionEntry,
    resetResumeBuilder,
    setCurrentResumeId,
    loadResume,
  } = useGlobalStore();

  const buildSectionsFromStore = useCallback((): Section[] => {
    const baseSections: Section[] = [
      {
        id: "education",
        type: "education",
        title: "Education",
        icon: SECTION_ICON_MAP.education,
        isExpanded: false,
        entries: resumeBuilder.data.education || [],
      },
      {
        id: "experience",
        type: "experience",
        title: "Professional Experience",
        icon: SECTION_ICON_MAP.experience,
        isExpanded: false,
        entries: resumeBuilder.data.experience || [],
      },
      {
        id: "skills",
        type: "skills",
        title: "Skills",
        icon: SECTION_ICON_MAP.skills,
        isExpanded: false,
        entries: resumeBuilder.data.skills || [],
      },
    ];

    const dynamicSections: Section[] | [] =
      resumeBuilder.data.dynamicSections?.map((section) => {
        const sectionType = (section.type as SectionType) || "custom";

        return {
          id: section.id,
          type: sectionType,
          title: section.title,
          icon: getSectionIcon(sectionType),
          isExpanded: false,
          entries: section.entries || [],
        } satisfies Section;
      }) || [];

    return [...baseSections, ...dynamicSections];
  }, [
    resumeBuilder.data.education,
    resumeBuilder.data.experience,
    resumeBuilder.data.skills,
    resumeBuilder.data.dynamicSections,
  ]);

  useEffect(() => {
    const idParam = params.id;
    const normalizedId = Array.isArray(idParam) ? idParam[0] : idParam ?? null;
    setCurrentResumeId(normalizedId);
  }, [params.id, setCurrentResumeId]);

  useEffect(() => {
    const idParam = params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam ?? null;

    if (!id || initializationRef.current) {
      return;
    }

    if (id === "new") {
      const hasExistingData = hasMeaningfulResumeData(resumeDataRef.current);

      if (!hasExistingData) {
        resetResumeBuilder();
        populateWithDummyContent(
          resumeDataRef.current.careerField || "technology"
        );
      }

      initializationRef.current = true;
      return;
    }

    let isMounted = true;

    getResumeById(id)
      .then((apiData) => {
        if (!isMounted) {
          return;
        }

        const storeData: ResumeData = {
          careerField: "",
          personalInfo: {
            fullName: apiData.personal?.fullName || (apiData.personal as unknown as Record<string, string>)?.name || "",
            email: apiData.personal?.email || "",
            phone: apiData.personal?.phone || "",
            location: apiData.personal?.location || "",
            linkedin: apiData.personal?.linkedIn || (apiData.personal as unknown as Record<string, string>)?.linkedin || "",
            website: apiData.personal?.website || "",
            github: (apiData.personal as unknown as Record<string, string>)?.github || "",
            summary: apiData.summary || "",
          },
          experience: (apiData.experience || []).map((exp) => ({
            id: crypto.randomUUID(),
            jobTitle: exp.title,
            company: exp.company,
            location: exp.location,
            startDate: exp.startDate,
            endDate: exp.endDate,
            current: false,
            description: exp.descriptions || [],
          })),
          education: (apiData.education || []).map((edu) => ({
            id: crypto.randomUUID(),
            degree: edu.degree,
            institution: edu.institution,
            location: edu.location,
            graduationDate: edu.endDate || (edu as unknown as Record<string, string>).year || "",
            gpa: (edu as unknown as Record<string, string>).gpa || "",
          })),
          skills: Object.entries(apiData.skills?.skills || {}).flatMap(
            ([category, skillNames]) =>
              (skillNames as string[]).map((name) => ({
                id: crypto.randomUUID(),
                name,
                category: category as "technical" | "soft" | "language",
                level: "intermediate" as const,
              }))
          ),
          customFields: [],
          dynamicSections: ((apiData as unknown as { sections?: Record<string, unknown>[] }).sections || []).map((s: Record<string, unknown>) => ({
            id: crypto.randomUUID(),
            title: (s.title as string) || "",
            type: (s.type as string) || ((s.title as string)?.toLowerCase().includes("certif") ? "certifications" : (s.title as string)?.toLowerCase().includes("project") ? "projects" : "custom"),
            entries: Array.isArray(s.items)
              ? (s.items as Record<string, unknown>[])
                  .filter((item, idx, arr) => {
                    const name = (item.name as string) || "";
                    return !name || arr.findIndex((i) => (i.name as string) === name) === idx;
                  })
                  .map((item) => ({
                    id: crypto.randomUUID(),
                    name: (item.name as string) || "",
                    title: (item.name as string) || "",
                    date: (item.year as string) || `${(item.startDate as string) || ""} - ${(item.endDate as string) || ""}`.replace(/^ - $/, ""),
                    issuer: (item.issuer as string) || "",
                    description: Array.isArray(item.bullets) ? (item.bullets as string[]).join("\n") : (item.description as string) || "",
                    bullets: Array.isArray(item.bullets) ? (item.bullets as string[]).join("\n") : "",
                  }))
              : [],
            description: (s.content as string) || "",
            bullets: "",
          })),
          template: "classic",
        };

        loadResume(storeData);
      })
      .catch((error) => {
      })
      .finally(() => {
        if (isMounted) {
          initializationRef.current = true;
        }
      });

    return () => {
      isMounted = false;
    };
  }, [params.id, populateWithDummyContent, resetResumeBuilder, loadResume]);

  const [activeTab, setActiveTab] = useState<"content" | "template">("content");
  const [showAddContentModal, setShowAddContentModal] = useState(false);
  const [showPersonalInfoModal, setShowPersonalInfoModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showManageFieldsModal, setShowManageFieldsModal] = useState(false);
  const [showAISummaryModal, setShowAISummaryModal] = useState(false);
  const [showAIBulletsModal, setShowAIBulletsModal] = useState(false);
  const [showCustomSectionTitleModal, setShowCustomSectionTitleModal] =
    useState(false);
  const [customSectionTitle, setCustomSectionTitle] = useState("");
  const [editingEducation, setEditingEducation] = useState<string | null>(null);
  const [editingExperience, setEditingExperience] = useState<string | null>(
    null
  );
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");

  // Dynamic section editing state
  const [editingDynamicEntry, setEditingDynamicEntry] = useState<{
    sectionId: string;
    entryId: string;
  } | null>(null);
  const [dynamicEntryForm, setDynamicEntryForm] = useState<Record<string, any>>(
    {}
  );
  const [editingSectionTitle, setEditingSectionTitle] = useState<string | null>(
    null
  );
  const [sectionTitleForm, setSectionTitleForm] = useState("");

  // Custom section content state
  const [customSectionForms, setCustomSectionForms] = useState<
    Record<string, { description: string; bullets: string }>
  >({});

  const resumeDataRef = useRef(resumeBuilder.data);
  const initializationRef = useRef(false);

  useEffect(() => {
    resumeDataRef.current = resumeBuilder.data;
  }, [resumeBuilder.data]);

  useEffect(() => {
    initializationRef.current = false;
  }, [params.id]);

  // Initialize custom section forms from store data
  useEffect(() => {
    const customSections =
      resumeBuilder.data.dynamicSections?.filter(
        (section) => section.type === "custom"
      ) || [];

    const forms: Record<string, { description: string; bullets: string }> = {};
    customSections.forEach((section) => {
      forms[section.id] = {
        description: section.description || "",
        bullets: section.bullets || "",
      };
    });

    setCustomSectionForms(forms);
  }, [resumeBuilder.data.dynamicSections]);

  // Personal Info Form with visibility controls - Expanded to include all fields
  const [personalInfoForm, setPersonalInfoForm] =
    useState<PersonalInfoFormState>({
      ...PERSONAL_INFO_FORM_TEMPLATE,
    });

  useEffect(() => {
    const personalInfo = resumeBuilder.data.personalInfo || {};
    const storedCustomFields = resumeBuilder.data.customFields || [];

    setPersonalInfoForm((previousForm) => {
      const nextForm: PersonalInfoFormState = {
        ...PERSONAL_INFO_FORM_TEMPLATE,
      };

      (
        Object.keys(PERSONAL_INFO_FORM_TEMPLATE) as Array<
          keyof typeof PERSONAL_INFO_FORM_TEMPLATE
        >
      ).forEach((key) => {
        const value = (personalInfo as Record<string, string | undefined>)[key];
        nextForm[key] = value || "";
      });

      storedCustomFields.forEach((field) => {
        nextForm[field.id] = field.value || "";
      });

      const previousKeys = Object.keys(previousForm);
      const nextKeys = Object.keys(nextForm);

      if (
        previousKeys.length === nextKeys.length &&
        nextKeys.every((key) => previousForm[key] === nextForm[key])
      ) {
        return previousForm;
      }

      return nextForm;
    });
  }, [resumeBuilder.data.personalInfo, resumeBuilder.data.customFields]);

  // Field visibility controls - Expanded to include all available fields
  const [fieldVisibility, setFieldVisibility] = useState({
    professionalTitle: true,
    email: true,
    phone: true,
    location: true,
    linkedin: true,
    website: true,
    github: false,
    twitter: false,
    dateOfBirth: false,
    nationality: false,
    languages: false,
    maritalStatus: false,
    driversLicense: false,
    militaryService: false,
    visaStatus: false,
    preferredPronouns: false,
    summary: true,
    careerObjective: false,
  });
  const fieldVisibilityInitialized = useRef(false);

  useEffect(() => {
    if (fieldVisibilityInitialized.current) {
      return;
    }

    const personalInfo = resumeBuilder.data.personalInfo;
    if (!personalInfo) {
      return;
    }

    const hasSavedValues = Object.values(personalInfo).some((value) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return Boolean(value);
    });

    if (!hasSavedValues) {
      return;
    }

    setFieldVisibility((previousVisibility) => ({
      ...previousVisibility,
      professionalTitle:
        previousVisibility.professionalTitle ||
        Boolean((personalInfo as Record<string, unknown>).professionalTitle),
      email: previousVisibility.email || Boolean(personalInfo.email),
      phone: previousVisibility.phone || Boolean(personalInfo.phone),
      location: previousVisibility.location || Boolean(personalInfo.location),
      linkedin: previousVisibility.linkedin || Boolean(personalInfo.linkedin),
      website: previousVisibility.website || Boolean(personalInfo.website),
      github:
        previousVisibility.github ||
        Boolean((personalInfo as Record<string, unknown>).github),
      twitter:
        previousVisibility.twitter ||
        Boolean((personalInfo as Record<string, unknown>).twitter),
      dateOfBirth:
        previousVisibility.dateOfBirth ||
        Boolean((personalInfo as Record<string, unknown>).dateOfBirth),
      nationality:
        previousVisibility.nationality ||
        Boolean((personalInfo as Record<string, unknown>).nationality),
      languages:
        previousVisibility.languages ||
        Boolean((personalInfo as Record<string, unknown>).languages),
      maritalStatus:
        previousVisibility.maritalStatus ||
        Boolean((personalInfo as Record<string, unknown>).maritalStatus),
      driversLicense:
        previousVisibility.driversLicense ||
        Boolean((personalInfo as Record<string, unknown>).driversLicense),
      militaryService:
        previousVisibility.militaryService ||
        Boolean((personalInfo as Record<string, unknown>).militaryService),
      visaStatus:
        previousVisibility.visaStatus ||
        Boolean((personalInfo as Record<string, unknown>).visaStatus),
      preferredPronouns:
        previousVisibility.preferredPronouns ||
        Boolean((personalInfo as Record<string, unknown>).preferredPronouns),
      summary: previousVisibility.summary || Boolean(personalInfo.summary),
      careerObjective:
        previousVisibility.careerObjective ||
        Boolean((personalInfo as Record<string, unknown>).careerObjective),
    }));

    fieldVisibilityInitialized.current = true;
  }, [resumeBuilder.data.personalInfo]);

  // Custom Fields
  const [customFields, setCustomFields] = useState<
    Array<{
      id: string;
      name: string;
      type: "text" | "textarea";
      enabled: boolean;
      value?: string;
    }>
  >([]);
  const [newCustomFieldName, setNewCustomFieldName] = useState("");
  const [newCustomFieldType, setNewCustomFieldType] = useState<
    "text" | "textarea"
  >("text");

  useEffect(() => {
    const storedCustomFields = resumeBuilder.data.customFields || [];
    setCustomFields((previousFields) => {
      const normalized = storedCustomFields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        enabled: field.enabled,
        value: field.value ?? "",
      }));

      if (
        previousFields.length === normalized.length &&
        previousFields.every((field, index) => {
          const compareField = normalized[index];
          return (
            field &&
            compareField &&
            field.id === compareField.id &&
            field.name === compareField.name &&
            field.type === compareField.type &&
            field.enabled === compareField.enabled &&
            (field.value ?? "") === (compareField.value ?? "")
          );
        })
      ) {
        return previousFields;
      }

      return normalized;
    });
  }, [resumeBuilder.data.customFields]);

  // Education Form
  const [educationForm, setEducationForm] = useState({
    degree: "",
    institution: "",
    location: "",
    graduationDate: "",
    gpa: "",
  });

  // Experience Form
  const [experienceForm, setExperienceForm] = useState({
    jobTitle: "",
    company: "",
    location: "",
    startDate: "",
    endDate: "",
    current: false,
    description: [] as string[],
  });

  // Skill Form
  const [skillForm, setSkillForm] = useState({
    name: "",
    category: "technical" as "technical" | "soft" | "language",
    level: "intermediate" as
      | "beginner"
      | "intermediate"
      | "advanced"
      | "expert",
  });

  // Accordion state - track which section is currently expanded
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);

  // Local sections state (for the collapsible UI)
  const [sections, setSections] = useState<Section[]>(buildSectionsFromStore);

  useEffect(() => {
    setSections((prevSections) => {
      const expandedState = new Map(
        prevSections.map((section) => [section.id, section.isExpanded])
      );

      return buildSectionsFromStore().map((section) => ({
        ...section,
        isExpanded: expandedState.get(section.id) ?? section.isExpanded,
      }));
    });
  }, [buildSectionsFromStore]);

  // Section management functions - Accordion behavior (only one section open at a time)
  const toggleSection = (sectionId: string) => {
    // If clicking the currently expanded section, collapse it
    if (expandedSection === sectionId) {
      setExpandedSection(null);
      setSections(
        sections.map((s) =>
          s.id === sectionId ? { ...s, isExpanded: false } : s
        )
      );
    } else {
      // Otherwise, collapse all sections and expand the clicked one
      setExpandedSection(sectionId);
      setSections(
        sections.map((s) => ({
          ...s,
          isExpanded: s.id === sectionId,
        }))
      );
    }
  };

  // Dynamic section entry handlers
  const handleAddDynamicEntry = (sectionId: string) => {
    const newEntryId = `entry-${Date.now()}`;
    setEditingDynamicEntry({ sectionId, entryId: newEntryId });
    setDynamicEntryForm({});
    setExpandedSection(sectionId);
    setSections((prevSections) =>
      prevSections.map((section) => ({
        ...section,
        isExpanded: section.id === sectionId,
      }))
    );
  };

  const handleEditDynamicEntry = (
    sectionId: string,
    entryId: string,
    entryData: any
  ) => {
    setEditingDynamicEntry({ sectionId, entryId });
    setDynamicEntryForm(entryData);
  };

  const handleSaveDynamicEntry = (sectionId: string) => {
    if (!editingDynamicEntry) return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const isNewEntry = !section.entries.some(
      (e) => e.id === editingDynamicEntry.entryId
    );

    // Update local state
    setSections(
      sections.map((s) => {
        if (s.id === sectionId) {
          if (isNewEntry) {
            // Add new entry
            return {
              ...s,
              entries: [
                ...s.entries,
                { id: editingDynamicEntry.entryId, ...dynamicEntryForm },
              ],
            };
          } else {
            // Update existing entry
            return {
              ...s,
              entries: s.entries.map((e) =>
                e.id === editingDynamicEntry.entryId
                  ? { ...e, ...dynamicEntryForm }
                  : e
              ),
            };
          }
        }
        return s;
      })
    );

    // Sync to global store (only for dynamic sections, not education/experience/skills)
    if (
      section.type !== "education" &&
      section.type !== "experience" &&
      section.type !== "skills"
    ) {
      if (isNewEntry) {
        addDynamicSectionEntry(sectionId, {
          id: editingDynamicEntry.entryId,
          ...dynamicEntryForm,
        } as any);
      } else {
        updateDynamicSectionEntry(
          sectionId,
          editingDynamicEntry.entryId,
          dynamicEntryForm as any
        );
      }
    }

    setEditingDynamicEntry(null);
    setDynamicEntryForm({});
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleDeleteDynamicEntry = (sectionId: string, entryId: string) => {
    const section = sections.find((s) => s.id === sectionId);

    // Update local state
    setSections(
      sections.map((s) =>
        s.id === sectionId
          ? { ...s, entries: s.entries.filter((e) => e.id !== entryId) }
          : s
      )
    );

    // Sync to global store (only for dynamic sections)
    if (
      section &&
      section.type !== "education" &&
      section.type !== "experience" &&
      section.type !== "skills"
    ) {
      removeDynamicSectionEntry(sectionId, entryId);
    }
  };

  const handleCreateCustomField = () => {
    const trimmedName = newCustomFieldName.trim();
    if (!trimmedName) {
      return;
    }

    const newFieldId = `custom_${Date.now()}`;
    const newField = {
      id: newFieldId,
      name: trimmedName,
      type: newCustomFieldType,
      enabled: true,
      value: "",
    } as const;

    setCustomFields((previousFields) => [...previousFields, newField]);
    setPersonalInfoForm((previousForm) => ({
      ...previousForm,
      [newFieldId]: "",
    }));

    addCustomField({
      id: newFieldId,
      name: trimmedName,
      type: newCustomFieldType,
      enabled: true,
      value: "",
    } as any);

    setNewCustomFieldName("");
    setNewCustomFieldType("text");
  };

  const handleToggleCustomFieldEnabled = (fieldId: string) => {
    const targetField = customFields.find((field) => field.id === fieldId);
    if (!targetField) {
      return;
    }

    const nextEnabled = !targetField.enabled;

    setCustomFields((previousFields) =>
      previousFields.map((field) =>
        field.id === fieldId ? { ...field, enabled: nextEnabled } : field
      )
    );

    updateCustomField(fieldId, { enabled: nextEnabled } as any);
  };

  const handleRemoveCustomFieldConfig = (fieldId: string) => {
    let updatedForm: PersonalInfoFormState | null = null;

    setPersonalInfoForm((previousForm) => {
      const nextForm = { ...previousForm } as Record<string, string>;
      delete nextForm[fieldId];
      updatedForm = nextForm as PersonalInfoFormState;
      return nextForm as PersonalInfoFormState;
    });

    setCustomFields((previousFields) =>
      previousFields.filter((field) => field.id !== fieldId)
    );

    removeCustomField(fieldId);

    if (updatedForm) {
      updatePersonalInfo(updatedForm);
    }
  };

  const handleRemoveSection = (sectionId: string) => {
    const sectionToRemove = sections.find(
      (section) => section.id === sectionId
    );

    if (!sectionToRemove || isBaseSectionType(sectionToRemove.type)) {
      return;
    }

    setSections((previousSections) =>
      previousSections.filter((section) => section.id !== sectionId)
    );
    removeDynamicSection(sectionId);

    if (editingDynamicEntry?.sectionId === sectionId) {
      setEditingDynamicEntry(null);
      setDynamicEntryForm({});
    }

    if (expandedSection === sectionId) {
      setExpandedSection(null);
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleEditSectionTitle = (sectionId: string, currentTitle: string) => {
    setEditingSectionTitle(sectionId);
    setSectionTitleForm(currentTitle);
  };

  const handleSaveSectionTitle = (sectionId: string) => {
    if (!sectionTitleForm.trim()) {
      return;
    }

    // Update local state
    setSections((previousSections) =>
      previousSections.map((section) =>
        section.id === sectionId
          ? { ...section, title: sectionTitleForm.trim() }
          : section
      )
    );

    // Update global store
    updateDynamicSection(sectionId, { title: sectionTitleForm.trim() });

    setEditingSectionTitle(null);
    setSectionTitleForm("");
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const isBaseSectionType = (type: SectionType) =>
    type === "education" || type === "experience" || type === "skills";

  const getSectionFieldConfig = (section: Section): SectionFieldConfig[] =>
    SECTION_FIELD_CONFIGS[section.type] || [];

  const renderDynamicFieldControl = (
    field: SectionFieldConfig,
    section?: Section
  ) => {
    const value = dynamicEntryForm[field.name] ?? "";

    if (field.type === "textarea") {
      // For custom section content, provide more rows and helpful placeholder
      const isCustomContent =
        section?.type === "custom" && field.name === "content";
      const rows = isCustomContent ? 5 : 3;
      const placeholder = isCustomContent
        ? "Enter description or bullet points (one per line)...\n\nExample:\n• First achievement\n• Second achievement\n• Third achievement"
        : field.placeholder;

      return (
        <textarea
          value={value}
          onChange={(event) =>
            setDynamicEntryForm({
              ...dynamicEntryForm,
              [field.name]: event.target.value,
            })
          }
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          rows={rows}
        />
      );
    }

    if (field.type === "select") {
      return (
        <select
          value={value}
          onChange={(event) =>
            setDynamicEntryForm({
              ...dynamicEntryForm,
              [field.name]: event.target.value,
            })
          }
          className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select {field.label}</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    const inputType = field.type === "date" ? "date" : "text";

    return (
      <input
        type={inputType}
        value={value}
        onChange={(event) =>
          setDynamicEntryForm({
            ...dynamicEntryForm,
            [field.name]: event.target.value,
          })
        }
        placeholder={field.placeholder}
        className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
      />
    );
  };

  // Helper function to determine AI field type based on section type and field name
  const getAIFieldType = (
    sectionType: SectionType,
    fieldName: string
  ): import("@/components/ai/GenerateButton").AIFieldType | null => {
    // Map section types and field names to AI field types
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

  // Helper function to build context for AI generation
  const buildAIContext = (sectionType: SectionType, fieldName: string) => {
    const formData = dynamicEntryForm;

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
          name: resumeBuilder.data.personalInfo.fullName || "",
          location: resumeBuilder.data.personalInfo.location || "",
        };
      default:
        return {};
    }
  };

  const renderDynamicSectionForm = (
    section: Section,
    actionLabel: "Add" | "Save"
  ) => {
    const fieldConfig = getSectionFieldConfig(section);

    if (!fieldConfig.length) {
      return (
        <p className="text-xs text-muted-foreground">
          This section does not have configurable fields.
        </p>
      );
    }

    return (
      <>
        {section.type === "custom" && (
          <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              💡 <strong>Tip:</strong> For bullet points, enter each point on a
              new line. The template will automatically format them.
            </p>
          </div>
        )}
        {fieldConfig.map((field) => {
          const aiFieldType = getAIFieldType(section.type, field.name);
          const showAIButton = field.type === "textarea" && aiFieldType;

          return (
            <div key={field.name}>
              <div
                className={cn(
                  "mb-1",
                  showAIButton && "flex items-center justify-between gap-2"
                )}
              >
                <label className="block text-xs font-medium text-foreground">
                  {field.label}
                  {field.required ? (
                    <span className="text-destructive ml-1">*</span>
                  ) : null}
                </label>
                {showAIButton && aiFieldType && (
                  <GenerateButton
                    field={aiFieldType}
                    context={buildAIContext(section.type, field.name)}
                    variant="icon"
                    size="sm"
                    onGenerate={(content) => {
                      const value =
                        typeof content === "string"
                          ? content
                          : content.join("\n");
                      setDynamicEntryForm((prev) => {
                        const next = { ...prev, [field.name]: value };// If we are editing a dynamic entry, update it in the global store
                        // so the generated content is persisted and won't be overwritten
                        // by other updates. Do not close the edit panel — we only update
                        // the store value for the current entry.
                        if (editingDynamicEntry?.sectionId === section.id) {
                          setTimeout(
                            () =>
                              updateDynamicSectionEntry(
                                section.id,
                                editingDynamicEntry.entryId,
                                next as any
                              ),
                            15
                          );
                        }

                        return next;
                      });
                    }}
                  />
                )}
              </div>
              {renderDynamicFieldControl(field, section)}
            </div>
          );
        })}
        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={() => {
              setEditingDynamicEntry(null);
              setDynamicEntryForm({});
            }}
            className="px-3 py-1.5 text-xs border border-input rounded-lg hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSaveDynamicEntry(section.id)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Check className="w-3 h-3" />
            {actionLabel}
          </button>
        </div>
      </>
    );
  };

  const renderCustomSectionContent = (section: Section) => {
    const form = customSectionForms[section.id] || {
      description: "",
      bullets: "",
    };

    const handleSaveCustomSection = () => {
      // Update global store with custom section data
      updateDynamicSection(section.id, {
        description: form.description,
        bullets: form.bullets,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    };

    return (
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-xs font-medium text-foreground">
              Description
            </label>
            <GenerateButton
              field="custom_description"
              context={{
                section_title: section.title,
                context: form.description || "",
                key_points: form.bullets || "",
              }}
              variant="icon"
              size="sm"
              onGenerate={(content) => {
                const description =
                  typeof content === "string" ? content : content.join("\n");
                setCustomSectionForms((prev) => ({
                  ...prev,
                  [section.id]: { ...form, description },
                }));handleSaveCustomSection();
              }}
            />
          </div>
          <textarea
            value={form.description}
            onChange={(e) =>
              setCustomSectionForms((prev) => ({
                ...prev,
                [section.id]: { ...form, description: e.target.value },
              }))
            }
            onBlur={handleSaveCustomSection}
            placeholder="Enter a brief description or paragraph..."
            className="w-full px-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            rows={3}
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-xs font-medium text-foreground">
              Bullets
            </label>
            <GenerateButton
              field="custom_bullets"
              context={{
                section_title: section.title,
                context: form.description || "",
                key_points: form.bullets || "",
              }}
              variant="icon"
              size="sm"
              onGenerate={(content) => {
                const bullets =
                  typeof content === "string" ? content : content.join("\n");
                setCustomSectionForms((prev) => ({
                  ...prev,
                  [section.id]: { ...form, bullets },
                }));handleSaveCustomSection();
              }}
            />
          </div>
          <textarea
            value={form.bullets}
            onChange={(e) =>
              setCustomSectionForms((prev) => ({
                ...prev,
                [section.id]: { ...form, bullets: e.target.value },
              }))
            }
            onBlur={handleSaveCustomSection}
            placeholder="Enter bullet points (one per line)...&#10;&#10;Example:&#10;• First point&#10;• Second point&#10;• Third point"
            className="w-full px-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            rows={5}
          />
          <p className="text-xs text-muted-foreground mt-1">
            💡 Tip: Enter each bullet point on a new line. The template will
            automatically format them.
          </p>
        </div>
      </div>
    );
  };

  const renderDynamicSectionContent = (section: Section) => {
    // Custom sections have a different rendering
    if (section.type === "custom") {
      return renderCustomSectionContent(section);
    }

    const fieldConfig = getSectionFieldConfig(section);
    const isEditingNewEntry =
      editingDynamicEntry?.sectionId === section.id &&
      !section.entries.some(
        (entry) => entry.id === editingDynamicEntry.entryId
      );

    return (
      <>
        {section.entries.map((entry) => {
          const isEditingCurrentEntry =
            editingDynamicEntry?.sectionId === section.id &&
            editingDynamicEntry.entryId === entry.id;

          return (
            <div
              key={entry.id}
              className="bg-muted/30 rounded-lg p-2 border border-border"
            >
              {isEditingCurrentEntry ? (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  {renderDynamicSectionForm(section, "Save")}
                </motion.div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    {fieldConfig.length ? (
                      fieldConfig.slice(0, 2).map((field) => {
                        const value = entry[field.name];
                        if (!value) return null;

                        // Special handling for custom section content field
                        if (
                          section.type === "custom" &&
                          field.name === "content"
                        ) {
                          const displayValue =
                            value.length > 100
                              ? value.substring(0, 100) + "..."
                              : value;
                          return (
                            <p
                              key={field.name}
                              className="text-xs text-foreground"
                            >
                              <span className="font-medium">
                                {field.label}:
                              </span>{" "}
                              {displayValue}
                            </p>
                          );
                        }

                        return (
                          <p
                            key={field.name}
                            className="text-xs text-foreground truncate"
                          >
                            <span className="font-medium">{field.label}:</span>{" "}
                            {value}
                          </p>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No preview available for this entry.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() =>
                        handleEditDynamicEntry(section.id, entry.id, entry)
                      }
                      className="p-1 hover:bg-accent rounded transition-colors"
                      title="Edit entry"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() =>
                        handleDeleteDynamicEntry(section.id, entry.id)
                      }
                      className="p-1 hover:bg-destructive/10 rounded transition-colors"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {isEditingNewEntry ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-muted/30 rounded-lg p-3 border border-border space-y-2"
          >
            {renderDynamicSectionForm(section, "Add")}
          </motion.div>
        ) : (
          <button
            onClick={() => handleAddDynamicEntry(section.id)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-accent/50 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add New Entry
          </button>
        )}
      </>
    );
  };

  const renderSectionHeaderMeta = (section: Section) => {
    // Custom sections don't have entries
    if (section.type === "custom") {
      const form = customSectionForms[section.id];
      if (!form || (!form.description && !form.bullets)) {
        return "No content yet";
      }
      return "Has content";
    }

    const count = section.entries.length;
    if (!count) return "No entries yet";
    return `${count} ${count === 1 ? "entry" : "entries"}`;
  };

  const renderSectionHeaderActions = (section: Section) => {
    const isNewEntryActive =
      editingDynamicEntry?.sectionId === section.id &&
      !section.entries.some(
        (entry) => entry.id === editingDynamicEntry.entryId
      );

    // Custom sections don't have "Add Entry" button
    if (section.type === "custom") {
      return (
        <div className="flex items-center gap-1">
          <button
            onClick={(event) => {
              event.stopPropagation();
              handleRemoveSection(section.id);
            }}
            className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
            aria-label="Delete section"
            title="Delete section"
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </button>
        </div>
      );
    }

    // Always show delete button, but hide add button when form is active
    return (
      <div className="flex items-center gap-1">
        {!isNewEntryActive && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              handleAddDynamicEntry(section.id);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-accent transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Entry
          </button>
        )}
        <button
          onClick={(event) => {
            event.stopPropagation();
            handleRemoveSection(section.id);
          }}
          className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
          aria-label="Delete entire section"
          title="Delete entire section"
        >
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </button>
      </div>
    );
  };

  const addSection = (sectionType: SectionType, title: string, icon: any) => {
    // For custom sections, prompt for a custom title first
    if (sectionType === "custom") {
      setCustomSectionTitle("");
      setShowCustomSectionTitleModal(true);
      setShowAddContentModal(false);
      return;
    }

    const sectionId = `section-${Date.now()}`;
    const newSection: Section = {
      id: sectionId,
      type: sectionType,
      title,
      icon,
      isExpanded: true,
      entries: [],
    };
    setSections((previousSections) => [...previousSections, newSection]);

    // Sync to global store with the same ID
    addDynamicSection({
      id: sectionId,
      type: sectionType,
      title,
      entries: [],
    } as any);

    setShowAddContentModal(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleConfirmCustomSectionTitle = () => {
    if (!customSectionTitle.trim()) {
      return;
    }

    const sectionId = `section-${Date.now()}`;
    const newSection: Section = {
      id: sectionId,
      type: "custom",
      title: customSectionTitle.trim(),
      icon: FileText,
      isExpanded: true,
      entries: [],
    };
    setSections((previousSections) => [...previousSections, newSection]);

    // Sync to global store - custom sections have description and bullets fields
    addDynamicSection({
      id: sectionId,
      type: "custom",
      title: customSectionTitle.trim(),
      entries: [],
      description: "",
      bullets: "",
    } as any);

    // Initialize custom section form
    setCustomSectionForms((prev) => ({
      ...prev,
      [sectionId]: { description: "", bullets: "" },
    }));

    setShowCustomSectionTitleModal(false);
    setCustomSectionTitle("");
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Drag and Drop functionality
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }

    setActiveId(null);
  };

  // PDF Download Handler
  const handleDownloadPDF = async () => {
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { createPDFDocument } = await import(
        "../_components/PDFTemplateRenderer"
      );

      const pdfDoc = createPDFDocument(resumeBuilder.data);
      const blob = await pdf(pdfDoc).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${
        resumeBuilder.data.personalInfo.fullName || "resume"
      }.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Failed to download PDF. Please try again.");
    }
  };

  // Personal Info Handlers
  const handleEditPersonalInfo = () => {
    setPersonalInfoForm({
      fullName: resumeBuilder.data.personalInfo.fullName || "",
      professionalTitle:
        (resumeBuilder.data.personalInfo as any).professionalTitle || "",
      email: resumeBuilder.data.personalInfo.email || "",
      phone: resumeBuilder.data.personalInfo.phone || "",
      location: resumeBuilder.data.personalInfo.location || "",
      linkedin: resumeBuilder.data.personalInfo.linkedin || "",
      website: resumeBuilder.data.personalInfo.website || "",
      github: (resumeBuilder.data.personalInfo as any).github || "",
      twitter: (resumeBuilder.data.personalInfo as any).twitter || "",
      dateOfBirth: (resumeBuilder.data.personalInfo as any).dateOfBirth || "",
      nationality: (resumeBuilder.data.personalInfo as any).nationality || "",
      languages: (resumeBuilder.data.personalInfo as any).languages || "",
      maritalStatus:
        (resumeBuilder.data.personalInfo as any).maritalStatus || "",
      driversLicense:
        (resumeBuilder.data.personalInfo as any).driversLicense || "",
      militaryService:
        (resumeBuilder.data.personalInfo as any).militaryService || "",
      visaStatus: (resumeBuilder.data.personalInfo as any).visaStatus || "",
      preferredPronouns:
        (resumeBuilder.data.personalInfo as any).preferredPronouns || "",
      summary: resumeBuilder.data.personalInfo.summary || "",
      careerObjective:
        (resumeBuilder.data.personalInfo as any).careerObjective || "",
    });
    setShowPersonalInfoModal(true);
  };

  const persistPersonalInfoForm = (
    nextForm: PersonalInfoFormState,
    options: { closeModal?: boolean } = {}
  ) => {
    const { closeModal = false } = options;
    const customFieldSnapshot = customFields;

    updatePersonalInfo(nextForm);

    setCustomFields((previousFields) =>
      previousFields.map((field) => ({
        ...field,
        value: nextForm[field.id] ?? "",
      }))
    );

    customFieldSnapshot.forEach((field) => {
      const nextValue = nextForm[field.id] ?? "";
      if ((field.value ?? "") !== nextValue) {
        updateCustomField(field.id, { value: nextValue } as any);
      }
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);

    if (closeModal) {
      setShowPersonalInfoModal(false);
    }
  };

  const handleSavePersonalInfo = () => {
    persistPersonalInfoForm(personalInfoForm, { closeModal: true });
  };

  // Education Handlers
  const handleAddEducation = () => {
    setEducationForm({
      degree: "",
      institution: "",
      location: "",
      graduationDate: "",
      gpa: "",
    });
    setEditingEducation("new");
  };

  const handleEditEducation = (id: string) => {
    const edu = resumeBuilder.data.education.find((e) => e.id === id);
    if (edu) {
      setEducationForm({
        degree: edu.degree || "",
        institution: edu.institution || "",
        location: edu.location || "",
        graduationDate: edu.graduationDate || "",
        gpa: edu.gpa || "",
      });
      setEditingEducation(id);
    }
  };

  const handleSaveEducation = () => {
    if (editingEducation === "new") {
      addEducation(educationForm);
    } else if (editingEducation) {
      updateEducation(editingEducation, educationForm);
    }
    setEditingEducation(null);
  };

  // Experience Handlers
  const handleAddExperience = () => {
    setExperienceForm({
      jobTitle: "",
      company: "",
      location: "",
      startDate: "",
      endDate: "",
      current: false,
      description: [],
    });
    setEditingExperience("new");
  };

  const handleEditExperience = (id: string) => {
    const exp = resumeBuilder.data.experience.find((e) => e.id === id);
    if (exp) {
      setExperienceForm({
        jobTitle: exp.jobTitle || "",
        company: exp.company || "",
        location: exp.location || "",
        startDate: exp.startDate || "",
        endDate: exp.endDate || "",
        current: exp.current || false,
        description: exp.description || [],
      });
      setEditingExperience(id);
    }
  };

  const handleSaveExperience = () => {
    if (editingExperience === "new") {
      addExperience(experienceForm);
    } else if (editingExperience) {
      updateExperience(editingExperience, experienceForm);
    }
    setEditingExperience(null);
  };

  // Skill Handlers
  const handleAddSkill = () => {
    setSkillForm({
      name: "",
      category: "technical",
      level: "intermediate",
    });
    setEditingSkill("new");
  };

  const handleSaveSkill = () => {
    if (editingSkill === "new") {
      addSkill(skillForm);
    }
    setEditingSkill(null);
  };

  const dynamicSections = sections.filter(
    (section) => !isBaseSectionType(section.type)
  );

  const [editorTab, setEditorTab] = useState<"rewrite" | "editor" | "style">("editor");

  return (
    <div className="min-h-screen bg-background">
      {/* Success Notification */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] bg-foreground text-background px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm"
          >
            <Check className="w-4 h-4" />
            Saved
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content — Jobright-style: Preview Left, Editor Right */}
      <div className="grid lg:grid-cols-[1fr_380px] h-[calc(100dvh-4rem)]">
        {/* Left Panel - Live Resume Preview */}
        <div className="bg-secondary/30 overflow-y-auto flex flex-col">
          {/* Preview toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {resumeBuilder.data.personalInfo?.fullName || "Resume"}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-border text-muted-foreground">
                {resumeBuilder.data.template}
              </span>
            </div>
            <button
              onClick={() =>
                populateWithDummyContent(
                  resumeBuilder.data.careerField || "technology"
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-border transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Sample Data
            </button>
          </div>
          {/* PDF Preview */}
          <div className="flex-1 overflow-y-auto">
            <LivePreviewPDF />
          </div>
        </div>

        {/* Right Panel — Tabs: AI Rewrite / Editor / Style */}
        <div className="border-l border-gray-200 dark:border-border flex flex-col h-full bg-white dark:bg-card overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-gray-200 dark:border-border shrink-0 bg-gray-50/50 dark:bg-secondary/30">
            {(["rewrite", "editor", "style"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setEditorTab(tab)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium transition-colors text-center",
                  editorTab === tab
                    ? "text-gray-900 dark:text-foreground border-b-2 border-gray-900 dark:border-foreground bg-white dark:bg-card"
                    : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground"
                )}
              >
                {tab === "rewrite" ? "AI Rewrite" : tab === "editor" ? "Editor" : "Style"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {/* AI Rewrite Tab */}
            {editorTab === "rewrite" && (
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 dark:bg-secondary/30 rounded-xl border border-gray-200 dark:border-border p-6 text-center space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-secondary flex items-center justify-center mx-auto">
                    <Sparkles className="w-5 h-5 text-gray-500 dark:text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-foreground">AI Resume Optimization</p>
                  <p className="text-xs text-gray-500 dark:text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                    Paste a job posting and let AI rewrite your resume bullets, optimize keywords, and boost your ATS score
                  </p>
                  <button
                    onClick={() => window.location.href = "/dashboard/resume-builder/new"}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-foreground text-white dark:text-background rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-foreground/90 transition-colors shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Tailor for a Job
                  </button>
                </div>
              </div>
            )}

            {/* Editor Tab — section cards */}
            {editorTab === "editor" && (
              <div className="p-3 space-y-2 overflow-y-auto">
          {/* Template Gallery - Show when Template tab is active */}
          {activeTab === "template" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">
                  Choose a Template
                </h2>
                <p className="text-xs text-muted-foreground">
                  Select a template that best fits your career field and
                  personal style
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {TEMPLATES.map((template) => (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.01 }}
                    className={cn(
                      "bg-card rounded-lg border-2 overflow-hidden cursor-pointer transition-all",
                      resumeBuilder.data.template === template.id
                        ? "border-primary shadow-lg"
                        : "border-border hover:border-primary/50"
                    )}
                    onClick={() => {
                      setResumeTemplate(template.id as any);
                      setSaveSuccess(true);
                      setTimeout(() => setSaveSuccess(false), 2000);
                    }}
                  >
                    <div className="p-2 border-b border-border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {template.name}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {template.description}
                          </p>
                        </div>
                        {resumeBuilder.data.template === template.id && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-medium ml-2 flex-shrink-0">
                            <Check className="w-3 h-3" />
                            Active
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="aspect-[8.5/11] bg-muted rounded-lg overflow-hidden border border-border">
                        <TemplatePreviewCard
                          data={resumeBuilder.data}
                          templateId={template.id}
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Personal Info Section - Accordion Style */}
          {activeTab === "content" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-lg border border-border overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleSection("personalInfo")}
                className="w-full flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
              >
                <User className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="font-semibold text-foreground flex-1 text-left">
                  Personal Information
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowManageFieldsModal(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowManageFieldsModal(true);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-accent transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  Manage Fields
                </span>
                <motion.div
                  animate={{
                    rotate: expandedSection === "personalInfo" ? 180 : 0,
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </motion.div>
              </button>

              <AnimatePresence>
                {expandedSection === "personalInfo" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border overflow-hidden"
                  >
                    <div className="p-4 space-y-2">
                      {/* Personal Info Inline Form - Compact with Auto-save */}
                      <div className="space-y-2">
                        {/* Full Name - Always visible */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">
                              Full Name *
                            </label>
                            <input
                              type="text"
                              value={personalInfoForm.fullName}
                              onChange={(e) =>
                                setPersonalInfoForm({
                                  ...personalInfoForm,
                                  fullName: e.target.value,
                                })
                              }
                              onBlur={() => {
                                handleSavePersonalInfo();
                                setSaveSuccess(true);
                                setTimeout(() => setSaveSuccess(false), 2000);
                              }}
                              placeholder="John Doe"
                              className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                            />
                          </div>

                          {/* Professional Title - Conditional */}
                          {fieldVisibility.professionalTitle && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Professional Title
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.professionalTitle}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    professionalTitle: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="Software Engineer"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}
                        </div>

                        {/* Contact Info Row */}
                        <div className="grid grid-cols-2 gap-2">
                          {fieldVisibility.email && (
                            <div>
                              <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                Email
                              </label>
                              <input
                                type="email"
                                value={personalInfoForm.email}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    email: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="john@example.com"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.phone && (
                            <div>
                              <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                Phone
                              </label>
                              <input
                                type="tel"
                                value={personalInfoForm.phone}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    phone: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="+1 (555) 123-4567"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}
                        </div>

                        {/* Location & LinkedIn Row */}
                        <div className="grid grid-cols-2 gap-2">
                          {fieldVisibility.location && (
                            <div>
                              <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                Location
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.location}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    location: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="San Francisco, CA"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.linkedin && (
                            <div>
                              <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                                <Linkedin className="w-3 h-3" />
                                LinkedIn URL
                              </label>
                              <input
                                type="url"
                                value={personalInfoForm.linkedin}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    linkedin: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="linkedin.com/in/johndoe"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}
                        </div>

                        {/* Website & GitHub Row */}
                        <div className="grid grid-cols-2 gap-2">
                          {fieldVisibility.website && (
                            <div>
                              <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" />
                                Website/Portfolio
                              </label>
                              <input
                                type="url"
                                value={personalInfoForm.website}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    website: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="https://johndoe.com"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.github && (
                            <div>
                              <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                                <Github className="w-3 h-3" />
                                GitHub
                              </label>
                              <input
                                type="url"
                                value={personalInfoForm.github}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    github: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="github.com/johndoe"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}
                        </div>

                        {/* Additional Fields Row */}
                        <div className="grid grid-cols-2 gap-2">
                          {fieldVisibility.twitter && (
                            <div>
                              <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                                <Twitter className="w-3 h-3" />
                                Twitter
                              </label>
                              <input
                                type="url"
                                value={personalInfoForm.twitter}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    twitter: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="twitter.com/johndoe"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.dateOfBirth && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Date of Birth
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.dateOfBirth}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    dateOfBirth: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="January 1, 1990"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}
                        </div>

                        {/* Nationality & Languages Row */}
                        <div className="grid grid-cols-2 gap-2">
                          {fieldVisibility.nationality && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Nationality
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.nationality}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    nationality: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="American"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.languages && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Languages
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.languages}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    languages: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="English, Spanish"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.maritalStatus && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Marital Status
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.maritalStatus}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    maritalStatus: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="Single, Married, etc."
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.driversLicense && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Driver's License
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.driversLicense}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    driversLicense: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="Class A, B, C, etc."
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.militaryService && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Military Service
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.militaryService}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    militaryService: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="Branch, Rank, Years"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.visaStatus && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Visa Status
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.visaStatus}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    visaStatus: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="Work Permit, H1B, etc."
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}

                          {fieldVisibility.preferredPronouns && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Preferred Pronouns
                              </label>
                              <input
                                type="text"
                                value={personalInfoForm.preferredPronouns}
                                onChange={(e) =>
                                  setPersonalInfoForm({
                                    ...personalInfoForm,
                                    preferredPronouns: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  handleSavePersonalInfo();
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                placeholder="he/him, she/her, they/them"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                              />
                            </div>
                          )}
                        </div>

                        {/* Professional Summary */}
                        {fieldVisibility.summary && (
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <label className="block text-xs font-medium text-foreground">
                                Professional Summary
                              </label>
                              <GenerateButton
                                field="summary"
                                context={{
                                  currentRole:
                                    personalInfoForm.professionalTitle,
                                  keySkills: resumeBuilder.data.skills
                                    .map((s) => s.name)
                                    .join(", "),
                                  yearsExperience:
                                    resumeBuilder.data.experience.length,
                                }}
                                variant="icon"
                                size="sm"
                                onGenerate={(content) => {
                                  const summaryText =
                                    typeof content === "string"
                                      ? content
                                      : content[0] ?? "";
                                  const nextForm = {
                                    ...personalInfoForm,
                                    summary: summaryText,
                                  };

                                  setPersonalInfoForm(nextForm);
                                  persistPersonalInfoForm(nextForm);}}
                              />
                            </div>
                            <textarea
                              value={personalInfoForm.summary}
                              onChange={(e) =>
                                setPersonalInfoForm({
                                  ...personalInfoForm,
                                  summary: e.target.value,
                                })
                              }
                              onBlur={() => {
                                handleSavePersonalInfo();
                                setSaveSuccess(true);
                                setTimeout(() => setSaveSuccess(false), 2000);
                              }}
                              placeholder="Brief professional summary..."
                              rows={3}
                              className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all resize-none"
                            />
                          </div>
                        )}

                        {/* Career Objective */}
                        {fieldVisibility.careerObjective && (
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">
                              Career Objective
                            </label>
                            <textarea
                              value={personalInfoForm.careerObjective}
                              onChange={(e) =>
                                setPersonalInfoForm({
                                  ...personalInfoForm,
                                  careerObjective: e.target.value,
                                })
                              }
                              onBlur={() => {
                                handleSavePersonalInfo();
                                setSaveSuccess(true);
                                setTimeout(() => setSaveSuccess(false), 2000);
                              }}
                              placeholder="Your career objective..."
                              rows={3}
                              className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all resize-none"
                            />
                          </div>
                        )}

                        {/* Custom Fields */}
                        {customFields
                          .filter((field) => field.enabled)
                          .map((field) => (
                            <div key={field.id}>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                {field.name}
                              </label>
                              {field.type === "text" ? (
                                <input
                                  type="text"
                                  value={
                                    (personalInfoForm as any)[field.id] || ""
                                  }
                                  onChange={(e) =>
                                    setPersonalInfoForm({
                                      ...personalInfoForm,
                                      [field.id]: e.target.value,
                                    } as any)
                                  }
                                  onBlur={() => {
                                    handleSavePersonalInfo();
                                    setSaveSuccess(true);
                                    setTimeout(
                                      () => setSaveSuccess(false),
                                      2000
                                    );
                                  }}
                                  placeholder={`Enter ${field.name.toLowerCase()}...`}
                                  className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                                />
                              ) : (
                                <textarea
                                  value={
                                    (personalInfoForm as any)[field.id] || ""
                                  }
                                  onChange={(e) =>
                                    setPersonalInfoForm({
                                      ...personalInfoForm,
                                      [field.id]: e.target.value,
                                    } as any)
                                  }
                                  onBlur={() => {
                                    handleSavePersonalInfo();
                                    setSaveSuccess(true);
                                    setTimeout(
                                      () => setSaveSuccess(false),
                                      2000
                                    );
                                  }}
                                  placeholder={`Enter ${field.name.toLowerCase()}...`}
                                  rows={3}
                                  className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all resize-none"
                                />
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Skills Section - Accordion Style */}
          {activeTab === "content" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-lg border border-border overflow-hidden"
            >
              <button
                onClick={() => toggleSection("skills")}
                className="w-full flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
              >
                <Award className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="font-semibold text-foreground flex-1 text-left">
                  Skills
                </span>
                <span className="text-xs text-muted-foreground">
                  {resumeBuilder.data.skills.length} skills
                </span>
                <motion.div
                  animate={{
                    rotate: expandedSection === "skills" ? 180 : 0,
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </motion.div>
              </button>

              <AnimatePresence>
                {expandedSection === "skills" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border overflow-hidden"
                  >
                    <div className="p-6 space-y-4">
                      {/* Skills List */}
                      {resumeBuilder.data.skills.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {resumeBuilder.data.skills.map((skill) => (
                            <div
                              key={skill.id}
                              className="group relative px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium border border-primary/20 hover:bg-primary/20 transition-colors"
                            >
                              {skill.name}
                              <button
                                onClick={() => {
                                  removeSkill(skill.id);
                                  setSaveSuccess(true);
                                  setTimeout(() => setSaveSuccess(false), 2000);
                                }}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Skill Inline Form */}
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newSkillName}
                            onChange={(e) => setNewSkillName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newSkillName.trim()) {
                                addSkill({
                                  name: newSkillName.trim(),
                                  category: "technical",
                                  level: "intermediate",
                                });
                                setNewSkillName("");
                                setSaveSuccess(true);
                                setTimeout(() => setSaveSuccess(false), 2000);
                              }
                            }}
                            placeholder="Type a skill and press Enter"
                            className="flex-1 px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                          />
                          <button
                            onClick={() => {
                              if (newSkillName.trim()) {
                                addSkill({
                                  name: newSkillName.trim(),
                                  category: "technical",
                                  level: "intermediate",
                                });
                                setNewSkillName("");
                                setSaveSuccess(true);
                                setTimeout(() => setSaveSuccess(false), 2000);
                              }
                            }}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Add skills one at a time. Click the X on any skill to
                          remove it.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Education Section - Accordion Style with Inline Editing */}
          {activeTab === "content" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card rounded-lg border border-border overflow-hidden"
            >
              <button
                onClick={() => toggleSection("education")}
                className="w-full flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
              >
                <GraduationCap className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="font-semibold text-foreground flex-1 text-left">
                  Education
                </span>
                <span className="text-xs text-muted-foreground">
                  {resumeBuilder.data.education.length} entries
                </span>
                <motion.div
                  animate={{
                    rotate: expandedSection === "education" ? 180 : 0,
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </motion.div>
              </button>

              <AnimatePresence>
                {expandedSection === "education" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border overflow-hidden"
                  >
                    <div className="p-4 space-y-2">
                      {/* Education List */}
                      {resumeBuilder.data.education.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {resumeBuilder.data.education.map((edu) => (
                            <div key={edu.id}>
                              {editingEducation === edu.id ? (
                                /* Inline Edit Form */
                                <motion.div
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="p-3 bg-accent/20 rounded-lg border border-primary/30 space-y-2"
                                >
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        Degree *
                                      </label>
                                      <input
                                        type="text"
                                        value={educationForm.degree}
                                        onChange={(e) =>
                                          setEducationForm({
                                            ...educationForm,
                                            degree: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveEducation();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="Bachelor of Science"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        Institution *
                                      </label>
                                      <input
                                        type="text"
                                        value={educationForm.institution}
                                        onChange={(e) =>
                                          setEducationForm({
                                            ...educationForm,
                                            institution: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveEducation();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="University Name"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        Location
                                      </label>
                                      <input
                                        type="text"
                                        value={educationForm.location}
                                        onChange={(e) =>
                                          setEducationForm({
                                            ...educationForm,
                                            location: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveEducation();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="City, State"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        Graduation Date
                                      </label>
                                      <input
                                        type="text"
                                        value={educationForm.graduationDate}
                                        onChange={(e) =>
                                          setEducationForm({
                                            ...educationForm,
                                            graduationDate: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveEducation();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="May 2024"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        GPA
                                      </label>
                                      <input
                                        type="text"
                                        value={educationForm.gpa}
                                        onChange={(e) =>
                                          setEducationForm({
                                            ...educationForm,
                                            gpa: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveEducation();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="3.8"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                  </div>
                                </motion.div>
                              ) : (
                                /* Display Mode */
                                <div className="p-2 bg-muted/30 rounded-lg border border-border hover:border-primary/50 transition-all">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-sm font-semibold text-foreground">
                                        {edu.degree}
                                      </h4>
                                      <p className="text-xs text-muted-foreground">
                                        {edu.institution}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                                        {edu.location && (
                                          <span>{edu.location}</span>
                                        )}
                                        {edu.graduationDate && (
                                          <>
                                            <span>·</span>
                                            <span>{edu.graduationDate}</span>
                                          </>
                                        )}
                                        {edu.gpa && (
                                          <>
                                            <span>·</span>
                                            <span>GPA: {edu.gpa}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <button
                                        onClick={() =>
                                          handleEditEducation(edu.id)
                                        }
                                        className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                                      >
                                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          removeEducation(edu.id);
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add New Education Button */}
                      {editingEducation === "new" ? (
                        /* Inline Add Form */
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-3 bg-accent/20 rounded-lg border border-primary/30 space-y-2"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Degree *
                              </label>
                              <input
                                type="text"
                                value={educationForm.degree}
                                onChange={(e) =>
                                  setEducationForm({
                                    ...educationForm,
                                    degree: e.target.value,
                                  })
                                }
                                placeholder="Bachelor of Science"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Institution *
                              </label>
                              <input
                                type="text"
                                value={educationForm.institution}
                                onChange={(e) =>
                                  setEducationForm({
                                    ...educationForm,
                                    institution: e.target.value,
                                  })
                                }
                                placeholder="University Name"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Location
                              </label>
                              <input
                                type="text"
                                value={educationForm.location}
                                onChange={(e) =>
                                  setEducationForm({
                                    ...educationForm,
                                    location: e.target.value,
                                  })
                                }
                                placeholder="City, State"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Graduation Date
                              </label>
                              <input
                                type="text"
                                value={educationForm.graduationDate}
                                onChange={(e) =>
                                  setEducationForm({
                                    ...educationForm,
                                    graduationDate: e.target.value,
                                  })
                                }
                                placeholder="May 2024"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                GPA
                              </label>
                              <input
                                type="text"
                                value={educationForm.gpa}
                                onChange={(e) =>
                                  setEducationForm({
                                    ...educationForm,
                                    gpa: e.target.value,
                                  })
                                }
                                placeholder="3.8"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingEducation(null)}
                              className="px-3 py-1.5 text-xs border border-input rounded-lg hover:bg-accent transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                handleSaveEducation();
                                setSaveSuccess(true);
                                setTimeout(() => setSaveSuccess(false), 2000);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              Add
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <button
                          onClick={handleAddEducation}
                          className="w-full flex items-center justify-center gap-1 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Education
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Experience - Accordion Section */}
          {activeTab === "content" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-card rounded-lg border border-border overflow-hidden"
            >
              <button
                onClick={() => toggleSection("experience")}
                className="w-full flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
              >
                <Briefcase className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="font-semibold text-foreground flex-1 text-left">
                  Professional Experience
                </span>
                <span className="text-xs text-muted-foreground">
                  {resumeBuilder.data.experience.length} entries
                </span>
                <motion.div
                  animate={{
                    rotate: expandedSection === "experience" ? 180 : 0,
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </motion.div>
              </button>

              <AnimatePresence>
                {expandedSection === "experience" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border overflow-hidden"
                  >
                    <div className="p-4 space-y-2">
                      {/* Experience List */}
                      {resumeBuilder.data.experience.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {resumeBuilder.data.experience.map((exp) => (
                            <div key={exp.id}>
                              {editingExperience === exp.id ? (
                                /* Inline Edit Form */
                                <motion.div
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="p-3 bg-accent/20 rounded-lg border border-primary/30 space-y-2"
                                >
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        Job Title *
                                      </label>
                                      <input
                                        type="text"
                                        value={experienceForm.jobTitle}
                                        onChange={(e) =>
                                          setExperienceForm({
                                            ...experienceForm,
                                            jobTitle: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveExperience();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="Software Engineer"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        Company *
                                      </label>
                                      <input
                                        type="text"
                                        value={experienceForm.company}
                                        onChange={(e) =>
                                          setExperienceForm({
                                            ...experienceForm,
                                            company: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveExperience();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="Company Name"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        Location
                                      </label>
                                      <input
                                        type="text"
                                        value={experienceForm.location}
                                        onChange={(e) =>
                                          setExperienceForm({
                                            ...experienceForm,
                                            location: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveExperience();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="City, State"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        Start Date
                                      </label>
                                      <input
                                        type="text"
                                        value={experienceForm.startDate}
                                        onChange={(e) =>
                                          setExperienceForm({
                                            ...experienceForm,
                                            startDate: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveExperience();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="Jan 2023"
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-foreground mb-1">
                                        End Date
                                      </label>
                                      <input
                                        type="text"
                                        value={experienceForm.endDate}
                                        onChange={(e) =>
                                          setExperienceForm({
                                            ...experienceForm,
                                            endDate: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          handleSaveExperience();
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        placeholder="Present"
                                        disabled={experienceForm.current}
                                        className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none disabled:opacity-50"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id={`current-${exp.id}`}
                                      checked={experienceForm.current}
                                      onChange={(e) =>
                                        setExperienceForm({
                                          ...experienceForm,
                                          current: e.target.checked,
                                          endDate: e.target.checked
                                            ? ""
                                            : experienceForm.endDate,
                                        })
                                      }
                                      className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                                    />
                                    <label
                                      htmlFor={`current-${exp.id}`}
                                      className="text-xs text-foreground cursor-pointer"
                                    >
                                      I currently work here
                                    </label>
                                  </div>
                                  <div>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <label className="block text-xs font-medium text-foreground">
                                        Description
                                      </label>
                                      <GenerateButton
                                        field="experience_bullets"
                                        context={{
                                          job_title: experienceForm.jobTitle,
                                          company: experienceForm.company,
                                          responsibilities:
                                            experienceForm.description.join(
                                              "\n"
                                            ),
                                          achievements: "",
                                          technologies: "",
                                        }}
                                        variant="icon"
                                        size="sm"
                                        onGenerate={(content) => {
                                          const bullets = Array.isArray(content)
                                            ? content
                                            : content
                                                .split("\n")
                                                .filter((b) => b.trim());
                                          setExperienceForm((prev) => ({
                                            ...prev,
                                            description: bullets,
                                          }));}}
                                      />
                                    </div>
                                    <textarea
                                      value={experienceForm.description.join(
                                        "\n"
                                      )}
                                      onChange={(e) =>
                                        setExperienceForm({
                                          ...experienceForm,
                                          description:
                                            e.target.value.split("\n"),
                                        })
                                      }
                                      onBlur={() => {
                                        handleSaveExperience();
                                        setSaveSuccess(true);
                                        setTimeout(
                                          () => setSaveSuccess(false),
                                          2000
                                        );
                                      }}
                                      placeholder="• Achievement or responsibility&#10;• Another achievement&#10;• One more point"
                                      rows={4}
                                      className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none resize-none"
                                    />
                                  </div>
                                </motion.div>
                              ) : (
                                /* Display Mode */
                                <div className="p-2 bg-muted/30 rounded-lg border border-border hover:border-primary/50 transition-all">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-sm font-semibold text-foreground">
                                        {exp.jobTitle}
                                      </h4>
                                      <p className="text-xs text-muted-foreground">
                                        {exp.company}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                                        {exp.location && (
                                          <span>{exp.location}</span>
                                        )}
                                        {exp.startDate && (
                                          <>
                                            <span>·</span>
                                            <span>
                                              {exp.startDate} -{" "}
                                              {exp.current
                                                ? "Present"
                                                : exp.endDate}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <button
                                        onClick={() =>
                                          handleEditExperience(exp.id)
                                        }
                                        className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                                      >
                                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          removeExperience(exp.id);
                                          setSaveSuccess(true);
                                          setTimeout(
                                            () => setSaveSuccess(false),
                                            2000
                                          );
                                        }}
                                        className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add New Experience Button */}
                      {editingExperience === "new" ? (
                        /* Inline Add Form */
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-3 bg-accent/20 rounded-lg border border-primary/30 space-y-2"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Job Title *
                              </label>
                              <input
                                type="text"
                                value={experienceForm.jobTitle}
                                onChange={(e) =>
                                  setExperienceForm({
                                    ...experienceForm,
                                    jobTitle: e.target.value,
                                  })
                                }
                                placeholder="Software Engineer"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Company *
                              </label>
                              <input
                                type="text"
                                value={experienceForm.company}
                                onChange={(e) =>
                                  setExperienceForm({
                                    ...experienceForm,
                                    company: e.target.value,
                                  })
                                }
                                placeholder="Company Name"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Location
                              </label>
                              <input
                                type="text"
                                value={experienceForm.location}
                                onChange={(e) =>
                                  setExperienceForm({
                                    ...experienceForm,
                                    location: e.target.value,
                                  })
                                }
                                placeholder="City, State"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Start Date
                              </label>
                              <input
                                type="text"
                                value={experienceForm.startDate}
                                onChange={(e) =>
                                  setExperienceForm({
                                    ...experienceForm,
                                    startDate: e.target.value,
                                  })
                                }
                                placeholder="Jan 2023"
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1">
                                End Date
                              </label>
                              <input
                                type="text"
                                value={experienceForm.endDate}
                                onChange={(e) =>
                                  setExperienceForm({
                                    ...experienceForm,
                                    endDate: e.target.value,
                                  })
                                }
                                placeholder="Present"
                                disabled={experienceForm.current}
                                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none disabled:opacity-50"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="current-new"
                              checked={experienceForm.current}
                              onChange={(e) =>
                                setExperienceForm({
                                  ...experienceForm,
                                  current: e.target.checked,
                                  endDate: e.target.checked
                                    ? ""
                                    : experienceForm.endDate,
                                })
                              }
                              className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                            />
                            <label
                              htmlFor="current-new"
                              className="text-xs text-foreground cursor-pointer"
                            >
                              I currently work here
                            </label>
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <label className="block text-xs font-medium text-foreground">
                                Description
                              </label>
                              <GenerateButton
                                field="experience_bullets"
                                context={{
                                  job_title: experienceForm.jobTitle,
                                  company: experienceForm.company,
                                  responsibilities:
                                    experienceForm.description.join("\n"),
                                  achievements: "",
                                  technologies: "",
                                }}
                                variant="icon"
                                size="sm"
                                onGenerate={(content) => {
                                  const bullets = Array.isArray(content)
                                    ? content
                                    : content
                                        .split("\n")
                                        .filter((b) => b.trim());
                                  setExperienceForm((prev) => ({
                                    ...prev,
                                    description: bullets,
                                  }));}}
                              />
                            </div>
                            <textarea
                              value={experienceForm.description.join("\n")}
                              onChange={(e) =>
                                setExperienceForm({
                                  ...experienceForm,
                                  description: e.target.value.split("\n"),
                                })
                              }
                              placeholder="• Achievement or responsibility&#10;• Another achievement&#10;• One more point"
                              rows={4}
                              className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none resize-none"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingExperience(null)}
                              className="px-3 py-1.5 text-xs border border-input rounded-lg hover:bg-accent transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                handleSaveExperience();
                                setSaveSuccess(true);
                                setTimeout(() => setSaveSuccess(false), 2000);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              Add
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <button
                          onClick={handleAddExperience}
                          className="w-full flex items-center justify-center gap-1 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Experience
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Sections - Show only in Content tab */}
          {activeTab === "content" && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={dynamicSections.map((section) => section.id)}
                strategy={verticalListSortingStrategy}
              >
                {dynamicSections.map((section, index) => (
                  <SortableSection
                    key={section.id}
                    section={section}
                    index={index}
                    toggleSection={toggleSection}
                    headerMeta={renderSectionHeaderMeta(section)}
                    headerActions={renderSectionHeaderActions(section)}
                    editingSectionTitle={editingSectionTitle}
                    sectionTitleForm={sectionTitleForm}
                    onEditTitle={handleEditSectionTitle}
                    onSaveTitle={handleSaveSectionTitle}
                    onCancelEditTitle={() => {
                      setEditingSectionTitle(null);
                      setSectionTitleForm("");
                    }}
                    onTitleChange={setSectionTitleForm}
                  >
                    {renderDynamicSectionContent(section)}
                  </SortableSection>
                ))}
              </SortableContext>
              <DragOverlay>
                {activeId ? (
                  <div className="bg-card rounded-lg border-2 border-primary shadow-2xl p-4 opacity-90">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-5 h-5 text-primary" />
                      <span className="font-semibold text-foreground">
                        {sections.find((s) => s.id === activeId)?.title ||
                          "Section"}
                      </span>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
          {/* Add Section Button */}
          {activeTab === "content" && (
            <button
              onClick={() => setShowAddContentModal(true)}
              className="w-full py-2.5 bg-secondary/50 text-muted-foreground font-medium rounded-xl hover:bg-secondary hover:text-foreground border border-dashed border-border transition-colors flex items-center justify-center gap-2 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Section
            </button>
          )}
              </div>
            )}

            {/* Style Tab */}
            {editorTab === "style" && (
              <div className="p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Template</p>
                {activeTab === "template" ? null : (
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => {
                          setResumeTemplate(template.id as any);
                          setSaveSuccess(true);
                          setTimeout(() => setSaveSuccess(false), 1500);
                        }}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all text-xs",
                          resumeBuilder.data.template === template.id
                            ? "border-foreground bg-foreground/5 font-medium"
                            : "border-border hover:border-foreground/20"
                        )}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-gray-200 dark:border-border p-3 shrink-0 bg-white dark:bg-card">
            <button
              onClick={handleDownloadPDF}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 dark:bg-foreground text-white dark:text-background rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-foreground/90 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Resume
            </button>
          </div>
        </div>
      </div>

      {/* Personal Info Modal */}
      <AnimatePresence>
        {showPersonalInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4"
            onClick={() => setShowPersonalInfoModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-border max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-xl font-bold text-foreground">
                  Edit Personal Information
                </h2>
                <button
                  onClick={() => setShowPersonalInfoModal(false)}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={personalInfoForm.fullName}
                    onChange={(e) =>
                      setPersonalInfoForm({
                        ...personalInfoForm,
                        fullName: e.target.value,
                      })
                    }
                    placeholder="John Doe"
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                  />
                </div>

                {/* Professional Title */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Professional Title
                  </label>
                  <input
                    type="text"
                    value={personalInfoForm.professionalTitle}
                    onChange={(e) =>
                      setPersonalInfoForm({
                        ...personalInfoForm,
                        professionalTitle: e.target.value,
                      })
                    }
                    placeholder="Senior Software Engineer"
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                  />
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-foreground">
                        Email
                      </label>
                      <button
                        onClick={() =>
                          setFieldVisibility({
                            ...fieldVisibility,
                            email: !fieldVisibility.email,
                          })
                        }
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {fieldVisibility.email ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                        {fieldVisibility.email ? "Visible" : "Hidden"}
                      </button>
                    </div>
                    <input
                      type="email"
                      value={personalInfoForm.email}
                      onChange={(e) =>
                        setPersonalInfoForm({
                          ...personalInfoForm,
                          email: e.target.value,
                        })
                      }
                      placeholder="john@example.com"
                      className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-foreground">
                        Phone
                      </label>
                      <button
                        onClick={() =>
                          setFieldVisibility({
                            ...fieldVisibility,
                            phone: !fieldVisibility.phone,
                          })
                        }
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {fieldVisibility.phone ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                        {fieldVisibility.phone ? "Visible" : "Hidden"}
                      </button>
                    </div>
                    <input
                      type="tel"
                      value={personalInfoForm.phone}
                      onChange={(e) =>
                        setPersonalInfoForm({
                          ...personalInfoForm,
                          phone: e.target.value,
                        })
                      }
                      placeholder="+1 (555) 123-4567"
                      className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-foreground">
                      Location
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          location: !fieldVisibility.location,
                        })
                      }
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {fieldVisibility.location ? (
                        <Eye className="w-3 h-3" />
                      ) : (
                        <EyeOff className="w-3 h-3" />
                      )}
                      {fieldVisibility.location ? "Visible" : "Hidden"}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={personalInfoForm.location}
                    onChange={(e) =>
                      setPersonalInfoForm({
                        ...personalInfoForm,
                        location: e.target.value,
                      })
                    }
                    placeholder="San Francisco, CA"
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                  />
                </div>

                {/* LinkedIn & Website */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-foreground">
                        LinkedIn URL
                      </label>
                      <button
                        onClick={() =>
                          setFieldVisibility({
                            ...fieldVisibility,
                            linkedin: !fieldVisibility.linkedin,
                          })
                        }
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {fieldVisibility.linkedin ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                        {fieldVisibility.linkedin ? "Visible" : "Hidden"}
                      </button>
                    </div>
                    <input
                      type="url"
                      value={personalInfoForm.linkedin}
                      onChange={(e) =>
                        setPersonalInfoForm({
                          ...personalInfoForm,
                          linkedin: e.target.value,
                        })
                      }
                      placeholder="linkedin.com/in/johndoe"
                      className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-foreground">
                        Website/Portfolio
                      </label>
                      <button
                        onClick={() =>
                          setFieldVisibility({
                            ...fieldVisibility,
                            website: !fieldVisibility.website,
                          })
                        }
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {fieldVisibility.website ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                        {fieldVisibility.website ? "Visible" : "Hidden"}
                      </button>
                    </div>
                    <input
                      type="url"
                      value={personalInfoForm.website}
                      onChange={(e) =>
                        setPersonalInfoForm({
                          ...personalInfoForm,
                          website: e.target.value,
                        })
                      }
                      placeholder="johndoe.com"
                      className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Professional Summary */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Professional Summary
                  </label>
                  <textarea
                    value={personalInfoForm.summary}
                    onChange={(e) =>
                      setPersonalInfoForm({
                        ...personalInfoForm,
                        summary: e.target.value,
                      })
                    }
                    placeholder="A brief summary of your professional background and key achievements..."
                    rows={4}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    2-3 sentences highlighting your experience and expertise
                  </p>
                </div>
              </div>

              <div className="border-t border-border px-6 py-4 flex items-center justify-between bg-muted/30">
                <button
                  onClick={() => setShowPersonalInfoModal(false)}
                  className="px-4 py-2 border border-input rounded-lg text-sm font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePersonalInfo}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skills Modal */}
      <AnimatePresence>
        {showSkillsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4"
            onClick={() => setShowSkillsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-xl font-bold text-foreground">
                  Manage Skills
                </h2>
                <button
                  onClick={() => setShowSkillsModal(false)}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Add New Skill */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Add New Skill
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newSkillName.trim()) {
                          addSkill({
                            name: newSkillName.trim(),
                            category: "technical",
                            level: "intermediate",
                          });
                          setNewSkillName("");
                          setSaveSuccess(true);
                          setTimeout(() => setSaveSuccess(false), 2000);
                        }
                      }}
                      placeholder="e.g., JavaScript, Project Management, etc."
                      className="flex-1 px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    />
                    <button
                      onClick={() => {
                        if (newSkillName.trim()) {
                          addSkill({
                            name: newSkillName.trim(),
                            category: "technical",
                            level: "intermediate",
                          });
                          setNewSkillName("");
                          setSaveSuccess(true);
                          setTimeout(() => setSaveSuccess(false), 2000);
                        }
                      }}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Press Enter or click + to add
                  </p>
                </div>

                {/* Current Skills */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-3">
                    Current Skills ({resumeBuilder.data.skills.length})
                  </label>
                  {resumeBuilder.data.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {resumeBuilder.data.skills.map((skill) => (
                        <div
                          key={skill.id}
                          className="group flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium border border-primary/20 hover:bg-primary/20 transition-colors"
                        >
                          <span>{skill.name}</span>
                          <button
                            onClick={() => {
                              removeSkill(skill.id);
                              setSaveSuccess(true);
                              setTimeout(() => setSaveSuccess(false), 2000);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-8 bg-muted/30 rounded-lg">
                      No skills added yet. Add your first skill above.
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border px-6 py-4 flex items-center justify-end bg-muted/30">
                <button
                  onClick={() => setShowSkillsModal(false)}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Content Modal */}
      <AnimatePresence>
        {showAddContentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4"
            onClick={() => setShowAddContentModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-border max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">
                  Add content
                </h2>
                <button
                  onClick={() => setShowAddContentModal(false)}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {AVAILABLE_SECTIONS.filter(
                    (section) =>
                      // Allow custom sections to be added multiple times
                      section.type === "custom" ||
                      !sections.some((s) => s.type === section.type)
                  ).map((section) => (
                    <button
                      key={section.type}
                      onClick={() =>
                        addSection(section.type, section.title, section.icon)
                      }
                      className="group p-4 bg-background border border-border rounded-lg hover:border-primary hover:bg-accent/30 transition-all text-left"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                          <section.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground mb-1">
                            {section.title}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {section.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {AVAILABLE_SECTIONS.filter(
                  (section) =>
                    // Allow custom sections to be added multiple times
                    section.type === "custom" ||
                    !sections.some((s) => s.type === section.type)
                ).length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground text-sm">
                      All available sections have been added to your resume.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Section Title Modal */}
      <AnimatePresence>
        {showCustomSectionTitleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowCustomSectionTitleModal(false);
              setCustomSectionTitle("");
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-xl shadow-2xl max-w-md w-full border border-border"
            >
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">
                  Name Your Custom Section
                </h2>
                <button
                  onClick={() => {
                    setShowCustomSectionTitleModal(false);
                    setCustomSectionTitle("");
                  }}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Section Title <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={customSectionTitle}
                    onChange={(e) => setCustomSectionTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customSectionTitle.trim()) {
                        handleConfirmCustomSectionTitle();
                      }
                    }}
                    placeholder="e.g., Hobbies, Volunteer Work, Additional Information"
                    className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Give your custom section a descriptive name that will appear
                    on your resume.
                  </p>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowCustomSectionTitleModal(false);
                      setCustomSectionTitle("");
                    }}
                    className="px-4 py-2 border border-input rounded-lg hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmCustomSectionTitle}
                    disabled={!customSectionTitle.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create Section
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manage Fields Modal */}
      <AnimatePresence>
        {showManageFieldsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowManageFieldsModal(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-border max-w-xl w-full max-h-[85vh] flex flex-col"
            >
              <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg font-bold text-foreground">
                  Manage Personal Info Fields
                </h2>
                <button
                  onClick={() => setShowManageFieldsModal(false)}
                  className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <p className="text-xs text-muted-foreground">
                  Toggle which fields appear in your Personal Information
                  section. Only enabled fields will be shown in the form.
                </p>

                {/* Basic Information */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Basic Information
                  </h3>

                  {/* Full Name - Always Required */}
                  <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border border-border">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Full Name
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Required field - always visible
                      </p>
                    </div>
                    <div className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">
                      Required
                    </div>
                  </div>

                  {/* Professional Title */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Professional Title
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          professionalTitle: !fieldVisibility.professionalTitle,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.professionalTitle
                          ? "bg-primary"
                          : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.professionalTitle && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Contact Information
                  </h3>

                  {/* Email */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Email
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          email: !fieldVisibility.email,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.email ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.email && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Phone */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Phone
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          phone: !fieldVisibility.phone,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.phone ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.phone && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Location */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Location
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          location: !fieldVisibility.location,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.location ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.location && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Social Links */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Social Links
                  </h3>

                  {/* LinkedIn */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      LinkedIn URL
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          linkedin: !fieldVisibility.linkedin,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.linkedin ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.linkedin && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Website */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Website/Portfolio
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          website: !fieldVisibility.website,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.website ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.website && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* GitHub */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      GitHub
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          github: !fieldVisibility.github,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.github ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.github && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Twitter */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Twitter
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          twitter: !fieldVisibility.twitter,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.twitter ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.twitter && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Personal Details */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Personal Details
                  </h3>

                  {/* Date of Birth */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Date of Birth
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          dateOfBirth: !fieldVisibility.dateOfBirth,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.dateOfBirth ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.dateOfBirth && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Nationality */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Nationality
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          nationality: !fieldVisibility.nationality,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.nationality ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.nationality && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Languages */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Languages
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          languages: !fieldVisibility.languages,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.languages ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.languages && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Marital Status */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Marital Status
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          maritalStatus: !fieldVisibility.maritalStatus,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.maritalStatus
                          ? "bg-primary"
                          : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.maritalStatus && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Driver's License */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Driver's License
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          driversLicense: !fieldVisibility.driversLicense,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.driversLicense
                          ? "bg-primary"
                          : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.driversLicense && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Military Service */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Military Service
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          militaryService: !fieldVisibility.militaryService,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.militaryService
                          ? "bg-primary"
                          : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.militaryService && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Visa Status */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Visa Status
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          visaStatus: !fieldVisibility.visaStatus,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.visaStatus ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.visaStatus && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Preferred Pronouns */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Preferred Pronouns
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          preferredPronouns: !fieldVisibility.preferredPronouns,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.preferredPronouns
                          ? "bg-primary"
                          : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.preferredPronouns && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Professional Summary */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Professional Summary
                  </h3>

                  {/* Summary */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Professional Summary
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          summary: !fieldVisibility.summary,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.summary ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.summary && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>

                  {/* Career Objective */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <label className="text-sm font-medium text-foreground cursor-pointer flex-1">
                      Career Objective
                    </label>
                    <button
                      onClick={() =>
                        setFieldVisibility({
                          ...fieldVisibility,
                          careerObjective: !fieldVisibility.careerObjective,
                        })
                      }
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        fieldVisibility.careerObjective
                          ? "bg-primary"
                          : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          fieldVisibility.careerObjective && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Custom Fields */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Custom Fields
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Add custom fields to your Personal Information section.
                  </p>

                  {/* Add New Custom Field Form */}
                  <div className="p-3 bg-muted/20 rounded-lg border border-border space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          Field Name
                        </label>
                        <input
                          type="text"
                          value={newCustomFieldName}
                          onChange={(e) =>
                            setNewCustomFieldName(e.target.value)
                          }
                          placeholder="e.g., Portfolio"
                          className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          Field Type
                        </label>
                        <select
                          value={newCustomFieldType}
                          onChange={(e) =>
                            setNewCustomFieldType(
                              e.target.value as "text" | "textarea"
                            )
                          }
                          className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="text">Text Input</option>
                          <option value="textarea">Text Area</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={handleCreateCustomField}
                      className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                    >
                      Add Custom Field
                    </button>
                  </div>

                  {/* List of Custom Fields */}
                  {customFields.length > 0 && (
                    <div className="space-y-2">
                      {customFields.map((field) => (
                        <div
                          key={field.id}
                          className="flex items-center justify-between p-2 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors"
                        >
                          <div className="flex-1">
                            <label className="text-sm font-medium text-foreground">
                              {field.name}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {field.type === "text"
                                ? "Text Input"
                                : "Text Area"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleToggleCustomFieldEnabled(field.id)
                              }
                              className={cn(
                                "relative w-11 h-6 rounded-full transition-colors",
                                field.enabled ? "bg-primary" : "bg-muted"
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                                  field.enabled && "translate-x-5"
                                )}
                              />
                            </button>
                            <button
                              onClick={() =>
                                handleRemoveCustomFieldConfig(field.id)
                              }
                              className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                            >
                              <X className="w-3.5 h-3.5 text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-card border-t border-border px-4 py-3 flex justify-end flex-shrink-0">
                <button
                  onClick={() => setShowManageFieldsModal(false)}
                  className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
