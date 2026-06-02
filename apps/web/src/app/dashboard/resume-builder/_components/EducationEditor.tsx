"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";

interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  location: string;
  graduationDate: string;
  gpa?: string;
}

interface EducationFormState {
  degree: string;
  institution: string;
  location: string;
  graduationDate: string;
  gpa: string;
}

export interface EducationEditorProps {
  expandedSection: string | null;
  toggleSection: (sectionId: string) => void;
  education: EducationEntry[];
  editingEducation: string | null;
  setEditingEducation: (id: string | null) => void;
  educationForm: EducationFormState;
  setEducationForm: (form: EducationFormState) => void;
  handleAddEducation: () => void;
  handleEditEducation: (id: string) => void;
  handleSaveEducation: () => void;
  removeEducation: (id: string) => void;
  setSaveSuccess: (success: boolean) => void;
}

export function EducationEditor({
  expandedSection,
  toggleSection,
  education,
  editingEducation,
  setEditingEducation,
  educationForm,
  setEducationForm,
  handleAddEducation,
  handleEditEducation,
  handleSaveEducation,
  removeEducation,
  setSaveSuccess,
}: EducationEditorProps) {
  const triggerSave = () => {
    handleSaveEducation();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const renderEditForm = (isNew: boolean) => (
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
            onBlur={isNew ? undefined : triggerSave}
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
            onBlur={isNew ? undefined : triggerSave}
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
            onBlur={isNew ? undefined : triggerSave}
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
            onBlur={isNew ? undefined : triggerSave}
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
            onBlur={isNew ? undefined : triggerSave}
            placeholder="3.8"
            className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
      </div>
      {isNew && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditingEducation(null)}
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
          {education.length} entries
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
              {education.length > 0 && (
                <div className="space-y-2 mb-3">
                  {education.map((edu) => (
                    <div key={edu.id}>
                      {editingEducation === edu.id ? (
                        renderEditForm(false)
                      ) : (
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
                                    <span>&middot;</span>
                                    <span>{edu.graduationDate}</span>
                                  </>
                                )}
                                {edu.gpa && (
                                  <>
                                    <span>&middot;</span>
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
                renderEditForm(true)
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
  );
}
