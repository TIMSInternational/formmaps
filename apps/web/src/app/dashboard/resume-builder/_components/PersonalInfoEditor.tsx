"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  User,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Twitter,
  ExternalLink,
  Settings,
} from "lucide-react";
import { GenerateButton } from "@/components/ai";
import { useTranslation } from "react-i18next";
import type { PersonalInfoFormState } from "../_lib/resume-constants";

interface CustomField {
  id: string;
  name: string;
  type: "text" | "textarea";
  enabled: boolean;
  value?: string;
}

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

export interface PersonalInfoEditorProps {
  expandedSection: string | null;
  toggleSection: (sectionId: string) => void;
  personalInfoForm: PersonalInfoFormState;
  setPersonalInfoForm: (form: PersonalInfoFormState) => void;
  fieldVisibility: FieldVisibility;
  setShowManageFieldsModal: (show: boolean) => void;
  handleSavePersonalInfo: () => void;
  persistPersonalInfoForm: (form: PersonalInfoFormState) => void;
  setSaveSuccess: (success: boolean) => void;
  customFields: CustomField[];
  skills: Array<{ id: string; name: string }>;
  experienceCount: number;
}

export function PersonalInfoEditor({
  expandedSection,
  toggleSection,
  personalInfoForm,
  setPersonalInfoForm,
  fieldVisibility,
  setShowManageFieldsModal,
  handleSavePersonalInfo,
  persistPersonalInfoForm,
  setSaveSuccess,
  customFields,
  skills,
  experienceCount,
}: PersonalInfoEditorProps) {
  const { t } = useTranslation();
  const triggerSave = () => {
    handleSavePersonalInfo();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={`bg-card rounded-xl border shadow-sm overflow-hidden transition-colors ${
        expandedSection === "personalInfo"
          ? "border-[#2E9098]/30"
          : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={() => toggleSection("personalInfo")}
        className={`w-full flex items-center gap-3 p-4 transition-colors ${
          expandedSection === "personalInfo"
            ? "bg-[#102B47]/5"
            : "hover:bg-secondary/50"
        }`}
      >
        <User className="w-5 h-5 text-[#2E9098] flex-shrink-0" />
        <span className="font-semibold text-foreground flex-1 text-left">
          {t("resumeBuilder.personalInfoStep.title", "Personal Information")}
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
          className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-lg hover:border-[#2E9098]/40 hover:text-[#2E9098] transition-colors"
        >
          <Settings className="w-3 h-3" />
          {t("resumeBuilder.personalInfoEditor.manageFields", "Manage Fields")}
        </span>
        <motion.div
          animate={{
            rotate: expandedSection === "personalInfo" ? 180 : 0,
          }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown
            className={`w-5 h-5 ${
              expandedSection === "personalInfo"
                ? "text-[#2E9098]"
                : "text-muted-foreground"
            }`}
          />
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
              <div className="space-y-2">
                {/* Full Name - Always visible */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      {t("resumeBuilder.personalInfoEditor.labels.fullName", "Full Name *")}
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
                      onBlur={triggerSave}
                      placeholder="John Doe"
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                    />
                  </div>

                  {fieldVisibility.professionalTitle && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.professionalTitle", "Professional Title")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.professionalTitle", "Software Engineer")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
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
                        {t("resumeBuilder.personalInfoEditor.labels.email", "Email")}
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
                        onBlur={triggerSave}
                        placeholder="john@example.com"
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.phone && (
                    <div>
                      <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {t("resumeBuilder.personalInfoEditor.labels.phone", "Phone")}
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
                        onBlur={triggerSave}
                        placeholder="+1 (555) 123-4567"
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
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
                        {t("resumeBuilder.personalInfoEditor.labels.location", "Location")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.location", "San Francisco, CA")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.linkedin && (
                    <div>
                      <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                        <Linkedin className="w-3 h-3" />
                        {t("resumeBuilder.personalInfoEditor.labels.linkedin", "LinkedIn URL")}
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
                        onBlur={triggerSave}
                        placeholder="linkedin.com/in/johndoe"
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
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
                        {t("resumeBuilder.personalInfoEditor.labels.website", "Website/Portfolio")}
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
                        onBlur={triggerSave}
                        placeholder="https://johndoe.com"
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.github && (
                    <div>
                      <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                        <Github className="w-3 h-3" />
                        {t("resumeBuilder.personalInfoEditor.labels.github", "GitHub")}
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
                        onBlur={triggerSave}
                        placeholder="github.com/johndoe"
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
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
                        {t("resumeBuilder.personalInfoEditor.labels.twitter", "Twitter")}
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
                        onBlur={triggerSave}
                        placeholder="twitter.com/johndoe"
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.dateOfBirth && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.dateOfBirth", "Date of Birth")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.dateOfBirth", "January 1, 1990")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}
                </div>

                {/* Nationality & Languages Row */}
                <div className="grid grid-cols-2 gap-2">
                  {fieldVisibility.nationality && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.nationality", "Nationality")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.nationality", "American")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.languages && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.languages", "Languages")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.languages", "English, Spanish")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.maritalStatus && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.maritalStatus", "Marital Status")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.maritalStatus", "Single, Married, etc.")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.driversLicense && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.driversLicense", "Driver's License")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.driversLicense", "Class A, B, C, etc.")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.militaryService && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.militaryService", "Military Service")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.militaryService", "Branch, Rank, Years")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.visaStatus && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.visaStatus", "Visa Status")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.visaStatus", "Work Permit, H1B, etc.")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}

                  {fieldVisibility.preferredPronouns && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t("resumeBuilder.personalInfoEditor.labels.preferredPronouns", "Preferred Pronouns")}
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
                        onBlur={triggerSave}
                        placeholder={t("resumeBuilder.personalInfoEditor.placeholders.preferredPronouns", "he/him, she/her, they/them")}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                      />
                    </div>
                  )}
                </div>

                {/* Professional Summary */}
                {fieldVisibility.summary && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-foreground">
                        {t("resumeBuilder.personalInfoEditor.labels.summary", "Professional Summary")}
                      </label>
                      <GenerateButton
                        field="summary"
                        context={{
                          currentRole:
                            personalInfoForm.professionalTitle,
                          keySkills: skills
                            .map((s) => s.name)
                            .join(", "),
                          yearsExperience: experienceCount,
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
                          persistPersonalInfoForm(nextForm);
                        }}
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
                      onBlur={triggerSave}
                      placeholder={t("resumeBuilder.personalInfoEditor.placeholders.summary", "Brief professional summary...")}
                      rows={3}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all resize-none"
                    />
                  </div>
                )}

                {/* Career Objective */}
                {fieldVisibility.careerObjective && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      {t("resumeBuilder.personalInfoEditor.labels.careerObjective", "Career Objective")}
                    </label>
                    <textarea
                      value={personalInfoForm.careerObjective}
                      onChange={(e) =>
                        setPersonalInfoForm({
                          ...personalInfoForm,
                          careerObjective: e.target.value,
                        })
                      }
                      onBlur={triggerSave}
                      placeholder={t("resumeBuilder.personalInfoEditor.placeholders.careerObjective", "Your career objective...")}
                      rows={3}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all resize-none"
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
                            (personalInfoForm as Record<string, string>)[field.id] || ""
                          }
                          onChange={(e) =>
                            setPersonalInfoForm({
                              ...personalInfoForm,
                              [field.id]: e.target.value,
                            } as PersonalInfoFormState)
                          }
                          onBlur={triggerSave}
                          placeholder={t("resumeBuilder.personalInfoEditor.enterField", "Enter {{field}}...", { field: field.name.toLowerCase() })}
                          className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all"
                        />
                      ) : (
                        <textarea
                          value={
                            (personalInfoForm as Record<string, string>)[field.id] || ""
                          }
                          onChange={(e) =>
                            setPersonalInfoForm({
                              ...personalInfoForm,
                              [field.id]: e.target.value,
                            } as PersonalInfoFormState)
                          }
                          onBlur={triggerSave}
                          placeholder={t("resumeBuilder.personalInfoEditor.enterField", "Enter {{field}}...", { field: field.name.toLowerCase() })}
                          rows={3}
                          className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#2E9098] focus:border-[#2E9098] outline-none transition-all resize-none"
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
  );
}
