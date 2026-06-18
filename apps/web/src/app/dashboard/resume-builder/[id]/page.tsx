"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Check,
  Download,
  Plus,
  FileText,
  GripVertical,
  Trash2,
  X,
} from "lucide-react";
import { useGlobalStore } from "@/store/useGlobalStore";
import type { ResumeData } from "@/store/useGlobalStore";
import { useResumeHandlers } from "../_hooks/useResumeHandlers";
import { LivePreviewPDF } from "../_components/LivePreviewPDF";
import { PersonalInfoEditor } from "../_components/PersonalInfoEditor";
import { SkillsEditor } from "../_components/SkillsEditor";
import { EducationEditor } from "../_components/EducationEditor";
import { ExperienceEditor } from "../_components/ExperienceEditor";
import { ResumePreviewPanel } from "../_components/ResumePreviewPanel";
import { ResumeTabSwitcher } from "../_components/ResumeTabSwitcher";
import type { EditorTab } from "../_components/ResumeTabSwitcher";
import { TemplatePreviewCard } from "../_components/TemplatePreviewCard";
import { DynamicSectionContent } from "../_components/DynamicSectionForm";
import { cn } from "@/lib/utils";
import { getResumeById } from "@/services/resumeService";
import { SortableSection } from "../_components/SortableSection";
import { ResumeModals } from "../_components/ResumeModals";
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
} from "@dnd-kit/sortable";

import {
  SECTION_ICON_MAP,
  getSectionIcon,
  PERSONAL_INFO_FORM_TEMPLATE,
  hasMeaningfulResumeData,
  TEMPLATES,
  AVAILABLE_SECTIONS,
  SECTION_FIELD_CONFIGS,
  type SectionType,
  type PersonalInfoFormState,
  type Entry,
  type Section,
  type SectionFieldConfig,
} from "../_lib/resume-constants";


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
    updateCustomField,
    addDynamicSection,
    updateDynamicSection,
    updateDynamicSectionEntry,
    resetResumeBuilder,
    setCurrentResumeId,
    loadResume,
    currentResumeId,
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
        setHasOriginalState(Boolean(apiData?.hasOriginal));
      })
      .catch((error) => {
          console.error("Failed to load resume", error);
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

  const [hasOriginalState, setHasOriginalState] = useState(false);
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

  const {
    editingDynamicEntry,
    setEditingDynamicEntry,
    dynamicEntryForm,
    setDynamicEntryForm,
    editingSectionTitle,
    setEditingSectionTitle,
    sectionTitleForm,
    setSectionTitleForm,
    handleAddDynamicEntry,
    handleEditDynamicEntry,
    handleSaveDynamicEntry,
    handleDeleteDynamicEntry,
    handleCreateCustomField,
    handleToggleCustomFieldEnabled,
    handleRemoveCustomFieldConfig,
    handleRemoveSection,
    handleEditSectionTitle,
    handleSaveSectionTitle,
    isBaseSectionType,
  } = useResumeHandlers({
    sections,
    setSections,
    expandedSection,
    setExpandedSection,
    setSaveSuccess,
    customFields,
    setCustomFields,
    newCustomFieldName,
    setNewCustomFieldName,
    newCustomFieldType,
    setNewCustomFieldType,
    personalInfoForm,
    setPersonalInfoForm,
  });

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

  const renderDynamicSectionContent = (section: Section) => (
    <DynamicSectionContent
      section={section}
      editingDynamicEntry={editingDynamicEntry}
      dynamicEntryForm={dynamicEntryForm}
      setDynamicEntryForm={setDynamicEntryForm}
      customSectionForms={customSectionForms}
      setCustomSectionForms={setCustomSectionForms}
      personalInfo={{
        fullName: resumeBuilder.data.personalInfo.fullName,
        location: resumeBuilder.data.personalInfo.location,
      }}
      onSaveEntry={handleSaveDynamicEntry}
      onCancelEdit={() => {
        setEditingDynamicEntry(null);
        setDynamicEntryForm({});
      }}
      onAddEntry={handleAddDynamicEntry}
      onEditEntry={handleEditDynamicEntry}
      onDeleteEntry={handleDeleteDynamicEntry}
      onSaveCustomSection={() => {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }}
      updateDynamicSectionEntry={updateDynamicSectionEntry}
      updateDynamicSection={updateDynamicSection}
    />
  );

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

  // ── Two-way contact sync with the original-PDF editor ──────────────────────
  // Latest form in a ref so a commit from the document persists current values.
  const personalInfoFormRef = useRef(personalInfoForm);
  personalInfoFormRef.current = personalInfoForm;

  const contactValues = useMemo(
    () => ({
      fullName: personalInfoForm.fullName ?? "",
      email: personalInfoForm.email ?? "",
      phone: personalInfoForm.phone ?? "",
      location: personalInfoForm.location ?? "",
      linkedin: personalInfoForm.linkedin ?? "",
      website: personalInfoForm.website ?? "",
      github: personalInfoForm.github ?? "",
    }),
    [
      personalInfoForm.fullName,
      personalInfoForm.email,
      personalInfoForm.phone,
      personalInfoForm.location,
      personalInfoForm.linkedin,
      personalInfoForm.website,
      personalInfoForm.github,
    ],
  );

  // left → right: the user edited a contact run on the document (live).
  const handleContactFieldChange = useCallback((field: string, value: string) => {
    setPersonalInfoForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // commit on blur of a document run → persist current form (store + autosave).
  const handleContactFieldCommit = useCallback(() => {
    persistPersonalInfoForm(personalInfoFormRef.current);
  }, [persistPersonalInfoForm]);

  // ── Two-way experience sync (single-line fields) with the original-PDF editor ─
  // Flatten the store's experience entries into `exp.<index>.<field>` values the
  // editor binds onto the document; commit-on-blur persists back to the entry.
  const experienceValues = useMemo(() => {
    const out: Record<string, string> = {};
    resumeBuilder.data.experience.forEach((e, i) => {
      out[`exp.${i}.jobTitle`] = e.jobTitle ?? "";
      out[`exp.${i}.company`] = e.company ?? "";
      out[`exp.${i}.location`] = e.location ?? "";
      out[`exp.${i}.startDate`] = e.startDate ?? "";
      out[`exp.${i}.endDate`] = e.endDate ?? "";
    });
    return out;
  }, [resumeBuilder.data.experience]);

  const handleExperienceFieldCommit = useCallback(
    (index: number, field: string, value: string) => {
      const entry = resumeBuilder.data.experience[index];
      if (!entry) return;
      updateExperience(entry.id, { [field]: value } as Partial<(typeof resumeBuilder.data.experience)[number]>);
    },
    [resumeBuilder.data.experience, updateExperience],
  );

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

  const [editorTab, setEditorTab] = useState<EditorTab>("editor");

  return (
    <div className="min-h-screen bg-background">
      {/* Success Notification */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] bg-[#065292] text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm"
          >
            <Check className="w-4 h-4" />
            Saved
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content — Jobright-style: Preview Left, Editor Right */}
      <div className="grid lg:grid-cols-[1fr_380px] h-[calc(100dvh-4rem)]">
        {/* Left Panel - Live Resume Preview */}
        <ResumePreviewPanel
          fullName={resumeBuilder.data.personalInfo?.fullName || ""}
          template={resumeBuilder.data.template}
          careerField={resumeBuilder.data.careerField || ""}
          onPopulateSampleData={populateWithDummyContent}
          resumeId={currentResumeId ?? ""}
          hasOriginal={hasOriginalState}
          contactValues={contactValues}
          onContactFieldChange={handleContactFieldChange}
          onContactFieldCommit={handleContactFieldCommit}
          experienceValues={experienceValues}
          onExperienceFieldCommit={handleExperienceFieldCommit}
        />

        {/* Right Panel — Tabs: AI Rewrite / Editor / Style */}
        <div className="border-l border-border flex flex-col h-full bg-white dark:bg-card overflow-hidden">
          {/* Tab switcher */}
          <ResumeTabSwitcher activeTab={editorTab} setActiveTab={setEditorTab} />

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {/* AI Rewrite Tab */}
            {editorTab === "rewrite" && (
              <div className="p-4 space-y-4">
                <div className="bg-secondary/30 rounded-xl border border-border p-6 text-center space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#065292]/10 flex items-center justify-center mx-auto">
                    <Sparkles className="w-5 h-5 text-[#065292]" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">AI Resume Optimization</p>
                  <p className="text-xs text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                    Paste a job posting and let AI rewrite your resume bullets, optimize keywords, and boost your ATS score
                  </p>
                  <button
                    onClick={() => window.location.href = "/dashboard/resume-builder/new"}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#065292] text-white rounded-lg text-sm font-medium hover:bg-[#054473] transition-colors shadow-sm"
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
                        ? "border-[#065292] shadow-lg"
                        : "border-border hover:border-[#065292]/50"
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
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-[#065292] text-white rounded-full text-xs font-medium ml-2 flex-shrink-0">
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
            <PersonalInfoEditor
              expandedSection={expandedSection}
              toggleSection={toggleSection}
              personalInfoForm={personalInfoForm}
              setPersonalInfoForm={setPersonalInfoForm}
              fieldVisibility={fieldVisibility}
              setShowManageFieldsModal={setShowManageFieldsModal}
              handleSavePersonalInfo={handleSavePersonalInfo}
              persistPersonalInfoForm={persistPersonalInfoForm}
              setSaveSuccess={setSaveSuccess}
              customFields={customFields}
              skills={resumeBuilder.data.skills}
              experienceCount={resumeBuilder.data.experience.length}
            />
          )}

          {/* Skills Section - Accordion Style */}
          {activeTab === "content" && (
            <SkillsEditor
              expandedSection={expandedSection}
              toggleSection={toggleSection}
              skills={resumeBuilder.data.skills}
              newSkillName={newSkillName}
              setNewSkillName={setNewSkillName}
              addSkill={addSkill}
              removeSkill={removeSkill}
              setSaveSuccess={setSaveSuccess}
            />
          )}

          {/* Education Section - Accordion Style with Inline Editing */}
          {activeTab === "content" && (
            <EducationEditor
              expandedSection={expandedSection}
              toggleSection={toggleSection}
              education={resumeBuilder.data.education}
              editingEducation={editingEducation}
              setEditingEducation={setEditingEducation}
              educationForm={educationForm}
              setEducationForm={setEducationForm}
              handleAddEducation={handleAddEducation}
              handleEditEducation={handleEditEducation}
              handleSaveEducation={handleSaveEducation}
              removeEducation={removeEducation}
              setSaveSuccess={setSaveSuccess}
            />
          )}

          {/* Experience - Accordion Section */}
          {activeTab === "content" && (
            <ExperienceEditor
              expandedSection={expandedSection}
              toggleSection={toggleSection}
              experience={resumeBuilder.data.experience}
              editingExperience={editingExperience}
              setEditingExperience={setEditingExperience}
              experienceForm={experienceForm}
              setExperienceForm={setExperienceForm}
              handleAddExperience={handleAddExperience}
              handleEditExperience={handleEditExperience}
              handleSaveExperience={handleSaveExperience}
              removeExperience={removeExperience}
              setSaveSuccess={setSaveSuccess}
            />
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
                  <div className="bg-card rounded-lg border-2 border-[#065292] shadow-2xl p-4 opacity-90">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-5 h-5 text-[#065292]" />
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
              className="w-full py-2.5 bg-secondary/30 text-muted-foreground font-medium rounded-xl hover:bg-[#065292]/10 hover:text-[#065292] hover:border-[#065292]/40 border border-dashed border-border transition-colors flex items-center justify-center gap-2 text-xs"
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
                            ? "border-[#065292] bg-[#065292]/5 text-[#065292] font-semibold"
                            : "border-border hover:border-[#065292]/30"
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
          <div className="border-t border-border p-3 shrink-0 bg-white dark:bg-card">
            <button
              onClick={handleDownloadPDF}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#065292] text-white rounded-lg text-sm font-medium hover:bg-[#054473] transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Resume
            </button>
          </div>
        </div>
      </div>


      <ResumeModals
        showPersonalInfoModal={showPersonalInfoModal}
        setShowPersonalInfoModal={setShowPersonalInfoModal}
        personalInfoForm={personalInfoForm}
        setPersonalInfoForm={setPersonalInfoForm}
        fieldVisibility={fieldVisibility}
        setFieldVisibility={setFieldVisibility}
        handleSavePersonalInfo={handleSavePersonalInfo}
        showSkillsModal={showSkillsModal}
        setShowSkillsModal={setShowSkillsModal}
        skills={resumeBuilder.data.skills}
        newSkillName={newSkillName}
        setNewSkillName={setNewSkillName}
        addSkill={addSkill}
        removeSkill={removeSkill}
        setSaveSuccess={setSaveSuccess}
        showAddContentModal={showAddContentModal}
        setShowAddContentModal={setShowAddContentModal}
        sections={sections}
        addSection={addSection}
        showCustomSectionTitleModal={showCustomSectionTitleModal}
        setShowCustomSectionTitleModal={setShowCustomSectionTitleModal}
        customSectionTitle={customSectionTitle}
        setCustomSectionTitle={setCustomSectionTitle}
        handleConfirmCustomSectionTitle={handleConfirmCustomSectionTitle}
        showManageFieldsModal={showManageFieldsModal}
        setShowManageFieldsModal={setShowManageFieldsModal}
        customFields={customFields}
        newCustomFieldName={newCustomFieldName}
        setNewCustomFieldName={setNewCustomFieldName}
        newCustomFieldType={newCustomFieldType}
        setNewCustomFieldType={setNewCustomFieldType}
        handleCreateCustomField={handleCreateCustomField}
        handleToggleCustomFieldEnabled={handleToggleCustomFieldEnabled}
        handleRemoveCustomFieldConfig={handleRemoveCustomFieldConfig}
      />
    </div>
  );
}
