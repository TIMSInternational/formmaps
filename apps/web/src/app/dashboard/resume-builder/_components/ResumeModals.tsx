"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Check,
  Plus,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AVAILABLE_SECTIONS,
  type SectionType,
  type PersonalInfoFormState,
  type Section,
} from "../_lib/resume-constants";

interface FieldVisibility {
  professionalTitle: boolean;
  email: boolean;
  phone: boolean;
  location: boolean;
  linkedin: boolean;
  website: boolean;
  github: boolean;
  twitter: boolean;
  dateOfBirth: boolean;
  nationality: boolean;
  languages: boolean;
  maritalStatus: boolean;
  driversLicense: boolean;
  militaryService: boolean;
  visaStatus: boolean;
  preferredPronouns: boolean;
  summary: boolean;
  careerObjective: boolean;
}

interface CustomField {
  id: string;
  name: string;
  type: "text" | "textarea";
  enabled: boolean;
  value?: string;
}

interface SkillItem {
  id: string;
  name: string;
  category: "technical" | "soft" | "language";
  level: "beginner" | "intermediate" | "advanced" | "expert";
}

export interface ResumeModalsProps {
  // Personal Info Modal
  showPersonalInfoModal: boolean;
  setShowPersonalInfoModal: (show: boolean) => void;
  personalInfoForm: PersonalInfoFormState;
  setPersonalInfoForm: (form: PersonalInfoFormState) => void;
  fieldVisibility: FieldVisibility;
  setFieldVisibility: (visibility: FieldVisibility) => void;
  handleSavePersonalInfo: () => void;

  // Skills Modal
  showSkillsModal: boolean;
  setShowSkillsModal: (show: boolean) => void;
  skills: SkillItem[];
  newSkillName: string;
  setNewSkillName: (name: string) => void;
  addSkill: (skill: { name: string; category: "technical" | "soft" | "language"; level: "beginner" | "intermediate" | "advanced" | "expert" }) => void;
  removeSkill: (id: string) => void;
  setSaveSuccess: (success: boolean) => void;

  // Add Content Modal
  showAddContentModal: boolean;
  setShowAddContentModal: (show: boolean) => void;
  sections: Section[];
  addSection: (type: SectionType, title: string, icon: unknown) => void;

  // Custom Section Title Modal
  showCustomSectionTitleModal: boolean;
  setShowCustomSectionTitleModal: (show: boolean) => void;
  customSectionTitle: string;
  setCustomSectionTitle: (title: string) => void;
  handleConfirmCustomSectionTitle: () => void;

  // Manage Fields Modal
  showManageFieldsModal: boolean;
  setShowManageFieldsModal: (show: boolean) => void;
  customFields: CustomField[];
  newCustomFieldName: string;
  setNewCustomFieldName: (name: string) => void;
  newCustomFieldType: "text" | "textarea";
  setNewCustomFieldType: (type: "text" | "textarea") => void;
  handleCreateCustomField: () => void;
  handleToggleCustomFieldEnabled: (id: string) => void;
  handleRemoveCustomFieldConfig: (id: string) => void;
}

export function ResumeModals({
  showPersonalInfoModal,
  setShowPersonalInfoModal,
  personalInfoForm,
  setPersonalInfoForm,
  fieldVisibility,
  setFieldVisibility,
  handleSavePersonalInfo,
  showSkillsModal,
  setShowSkillsModal,
  skills,
  newSkillName,
  setNewSkillName,
  addSkill,
  removeSkill,
  setSaveSuccess,
  showAddContentModal,
  setShowAddContentModal,
  sections,
  addSection,
  showCustomSectionTitleModal,
  setShowCustomSectionTitleModal,
  customSectionTitle,
  setCustomSectionTitle,
  handleConfirmCustomSectionTitle,
  showManageFieldsModal,
  setShowManageFieldsModal,
  customFields,
  newCustomFieldName,
  setNewCustomFieldName,
  newCustomFieldType,
  setNewCustomFieldType,
  handleCreateCustomField,
  handleToggleCustomFieldEnabled,
  handleRemoveCustomFieldConfig,
}: ResumeModalsProps) {
  return (
    <>
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
                    Current Skills ({skills.length})
                  </label>
                  {skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {skills.map((skill) => (
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
    </>
  );
}
