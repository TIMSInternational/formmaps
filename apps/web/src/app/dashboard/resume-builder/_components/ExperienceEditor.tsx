"use client";

import { type Dispatch, type SetStateAction } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { GenerateButton } from "@/components/ai";

interface ExperienceEntry {
  id: string;
  jobTitle: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string[];
}

interface ExperienceFormState {
  jobTitle: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string[];
}

export interface ExperienceEditorProps {
  expandedSection: string | null;
  toggleSection: (sectionId: string) => void;
  experience: ExperienceEntry[];
  editingExperience: string | null;
  setEditingExperience: (id: string | null) => void;
  experienceForm: ExperienceFormState;
  setExperienceForm: Dispatch<SetStateAction<ExperienceFormState>>;
  handleAddExperience: () => void;
  handleEditExperience: (id: string) => void;
  handleSaveExperience: () => void;
  removeExperience: (id: string) => void;
  setSaveSuccess: (success: boolean) => void;
}

export function ExperienceEditor({
  expandedSection,
  toggleSection,
  experience,
  editingExperience,
  setEditingExperience,
  experienceForm,
  setExperienceForm,
  handleAddExperience,
  handleEditExperience,
  handleSaveExperience,
  removeExperience,
  setSaveSuccess,
}: ExperienceEditorProps) {
  const triggerSave = () => {
    handleSaveExperience();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const renderEditForm = (isNew: boolean, entryId?: string) => (
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
              setExperienceForm((prev) => ({
                ...prev,
                jobTitle: e.target.value,
              }))
            }
            onBlur={isNew ? undefined : triggerSave}
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
              setExperienceForm((prev) => ({
                ...prev,
                company: e.target.value,
              }))
            }
            onBlur={isNew ? undefined : triggerSave}
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
              setExperienceForm((prev) => ({
                ...prev,
                location: e.target.value,
              }))
            }
            onBlur={isNew ? undefined : triggerSave}
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
              setExperienceForm((prev) => ({
                ...prev,
                startDate: e.target.value,
              }))
            }
            onBlur={isNew ? undefined : triggerSave}
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
              setExperienceForm((prev) => ({
                ...prev,
                endDate: e.target.value,
              }))
            }
            onBlur={isNew ? undefined : triggerSave}
            placeholder="Present"
            disabled={experienceForm.current}
            className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none disabled:opacity-50"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`current-${entryId || "new"}`}
          checked={experienceForm.current}
          onChange={(e) =>
            setExperienceForm((prev) => ({
              ...prev,
              current: e.target.checked,
              endDate: e.target.checked ? "" : prev.endDate,
            }))
          }
          className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
        />
        <label
          htmlFor={`current-${entryId || "new"}`}
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
              }));
            }}
          />
        </div>
        <textarea
          value={experienceForm.description.join("\n")}
          onChange={(e) =>
            setExperienceForm((prev) => ({
              ...prev,
              description: e.target.value.split("\n"),
            }))
          }
          onBlur={isNew ? undefined : triggerSave}
          placeholder="&#8226; Achievement or responsibility&#10;&#8226; Another achievement&#10;&#8226; One more point"
          rows={4}
          className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none resize-none"
        />
      </div>
      {isNew && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditingExperience(null)}
            className="px-3 py-1.5 text-xs border border-input rounded-lg hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={triggerSave}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Check className="w-3 h-3" />
            Add
          </button>
        </div>
      )}
    </motion.div>
  );

  return (
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
          {experience.length} entries
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
              {experience.length > 0 && (
                <div className="space-y-2 mb-3">
                  {experience.map((exp) => (
                    <div key={exp.id}>
                      {editingExperience === exp.id ? (
                        renderEditForm(false, exp.id)
                      ) : (
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
                                    <span>&middot;</span>
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
                renderEditForm(true)
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
  );
}
