"use client";

import { type Dispatch, type SetStateAction } from "react";
import { motion } from "motion/react";
import { Check, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GenerateButton } from "@/components/ai";
import type { AIFieldType } from "@/components/ai/GenerateButton";
import {
  type Section,
  type SectionFieldConfig,
  SECTION_FIELD_CONFIGS,
  getAIFieldType,
  buildAIContext,
} from "../_lib/resume-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditingDynamicEntry {
  sectionId: string;
  entryId: string;
}

interface DynamicSectionContentProps {
  section: Section;
  editingDynamicEntry: EditingDynamicEntry | null;
  dynamicEntryForm: Record<string, string>;
  setDynamicEntryForm: Dispatch<SetStateAction<Record<string, string>>>;
  customSectionForms: Record<string, { description: string; bullets: string }>;
  setCustomSectionForms: Dispatch<
    SetStateAction<Record<string, { description: string; bullets: string }>>
  >;
  personalInfo?: { fullName?: string; location?: string };
  onSaveEntry: (sectionId: string) => void;
  onCancelEdit: () => void;
  onAddEntry: (sectionId: string) => void;
  onEditEntry: (
    sectionId: string,
    entryId: string,
    entryData: Record<string, string>
  ) => void;
  onDeleteEntry: (sectionId: string, entryId: string) => void;
  onSaveCustomSection: (sectionId: string) => void;
  updateDynamicSectionEntry: (
    sectionId: string,
    entryId: string,
    data: Record<string, string>
  ) => void;
  updateDynamicSection: (
    sectionId: string,
    data: { description?: string; bullets?: string }
  ) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getSectionFieldConfig = (section: Section): SectionFieldConfig[] =>
  SECTION_FIELD_CONFIGS[section.type] || [];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders a single form control for a dynamic field. */
function DynamicFieldControl({
  field,
  section,
  dynamicEntryForm,
  setDynamicEntryForm,
}: {
  field: SectionFieldConfig;
  section?: Section;
  dynamicEntryForm: Record<string, string>;
  setDynamicEntryForm: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const value = dynamicEntryForm[field.name] ?? "";

  if (field.type === "textarea") {
    const isCustomContent =
      section?.type === "custom" && field.name === "content";
    const rows = isCustomContent ? 5 : 3;
    const placeholder = isCustomContent
      ? "Enter description or bullet points (one per line)...\n\nExample:\n\u2022 First achievement\n\u2022 Second achievement\n\u2022 Third achievement"
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
}

/** Renders the full add/edit form for a dynamic section entry. */
function DynamicEntryForm({
  section,
  actionLabel,
  dynamicEntryForm,
  setDynamicEntryForm,
  editingDynamicEntry,
  personalInfo,
  onSaveEntry,
  onCancelEdit,
  updateDynamicSectionEntry,
}: {
  section: Section;
  actionLabel: "Add" | "Save";
  dynamicEntryForm: Record<string, string>;
  setDynamicEntryForm: Dispatch<SetStateAction<Record<string, string>>>;
  editingDynamicEntry: EditingDynamicEntry | null;
  personalInfo?: { fullName?: string; location?: string };
  onSaveEntry: (sectionId: string) => void;
  onCancelEdit: () => void;
  updateDynamicSectionEntry: (
    sectionId: string,
    entryId: string,
    data: Record<string, string>
  ) => void;
}) {
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
            <strong>Tip:</strong> For bullet points, enter each point on a new
            line. The template will automatically format them.
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
                  field={aiFieldType as AIFieldType}
                  context={buildAIContext(
                    section.type,
                    field.name,
                    dynamicEntryForm,
                    personalInfo
                  )}
                  variant="icon"
                  size="sm"
                  onGenerate={(content) => {
                    const value =
                      typeof content === "string"
                        ? content
                        : content.join("\n");
                    setDynamicEntryForm((prev) => {
                      const next = { ...prev, [field.name]: value };
                      if (editingDynamicEntry?.sectionId === section.id) {
                        setTimeout(
                          () =>
                            updateDynamicSectionEntry(
                              section.id,
                              editingDynamicEntry.entryId,
                              next
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
            <DynamicFieldControl
              field={field}
              section={section}
              dynamicEntryForm={dynamicEntryForm}
              setDynamicEntryForm={setDynamicEntryForm}
            />
          </div>
        );
      })}
      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onCancelEdit}
          className="px-3 py-1.5 text-xs border border-input rounded-lg hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSaveEntry(section.id)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Check className="w-3 h-3" />
          {actionLabel}
        </button>
      </div>
    </>
  );
}

/** Renders custom section content (description + bullets). */
function CustomSectionContent({
  section,
  customSectionForms,
  setCustomSectionForms,
  onSaveCustomSection,
  updateDynamicSection,
}: {
  section: Section;
  customSectionForms: Record<string, { description: string; bullets: string }>;
  setCustomSectionForms: Dispatch<
    SetStateAction<Record<string, { description: string; bullets: string }>>
  >;
  onSaveCustomSection: (sectionId: string) => void;
  updateDynamicSection: (
    sectionId: string,
    data: { description?: string; bullets?: string }
  ) => void;
}) {
  const form = customSectionForms[section.id] || {
    description: "",
    bullets: "",
  };

  const handleSave = () => {
    updateDynamicSection(section.id, {
      description: form.description,
      bullets: form.bullets,
    });
    onSaveCustomSection(section.id);
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
              }));
              handleSave();
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
          onBlur={handleSave}
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
              }));
              handleSave();
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
          onBlur={handleSave}
          placeholder={"Enter bullet points (one per line)...\n\nExample:\n\u2022 First point\n\u2022 Second point\n\u2022 Third point"}
          className="w-full px-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          rows={5}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Tip: Enter each bullet point on a new line. The template will
          automatically format them.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

/**
 * DynamicSectionContent renders the full content area for a dynamic section:
 * - Custom sections: description + bullets form
 * - Other sections: entry list with inline add/edit forms
 */
export function DynamicSectionContent({
  section,
  editingDynamicEntry,
  dynamicEntryForm,
  setDynamicEntryForm,
  customSectionForms,
  setCustomSectionForms,
  personalInfo,
  onSaveEntry,
  onCancelEdit,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onSaveCustomSection,
  updateDynamicSectionEntry,
  updateDynamicSection,
}: DynamicSectionContentProps) {
  // Custom sections have a different rendering
  if (section.type === "custom") {
    return (
      <CustomSectionContent
        section={section}
        customSectionForms={customSectionForms}
        setCustomSectionForms={setCustomSectionForms}
        onSaveCustomSection={onSaveCustomSection}
        updateDynamicSection={updateDynamicSection}
      />
    );
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
                <DynamicEntryForm
                  section={section}
                  actionLabel="Save"
                  dynamicEntryForm={dynamicEntryForm}
                  setDynamicEntryForm={setDynamicEntryForm}
                  editingDynamicEntry={editingDynamicEntry}
                  personalInfo={personalInfo}
                  onSaveEntry={onSaveEntry}
                  onCancelEdit={onCancelEdit}
                  updateDynamicSectionEntry={updateDynamicSectionEntry}
                />
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
                      onEditEntry(section.id, entry.id, entry as Record<string, string>)
                    }
                    className="p-1 hover:bg-accent rounded transition-colors"
                    title="Edit entry"
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() =>
                      onDeleteEntry(section.id, entry.id)
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
          <DynamicEntryForm
            section={section}
            actionLabel="Add"
            dynamicEntryForm={dynamicEntryForm}
            setDynamicEntryForm={setDynamicEntryForm}
            editingDynamicEntry={editingDynamicEntry}
            personalInfo={personalInfo}
            onSaveEntry={onSaveEntry}
            onCancelEdit={onCancelEdit}
            updateDynamicSectionEntry={updateDynamicSectionEntry}
          />
        </motion.div>
      ) : (
        <button
          onClick={() => onAddEntry(section.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-accent/50 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add New Entry
        </button>
      )}
    </>
  );
}
