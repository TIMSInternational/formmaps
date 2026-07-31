import { useState, type Dispatch, type SetStateAction } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import type {
  SectionType,
  Entry,
  Section,
  PersonalInfoFormState,
} from "../_lib/resume-constants";

interface CustomField {
  id: string;
  name: string;
  type: "text" | "textarea";
  enabled: boolean;
  value?: string;
}

interface UseResumeHandlersParams {
  sections: Section[];
  setSections: Dispatch<SetStateAction<Section[]>>;
  expandedSection: string | null;
  setExpandedSection: Dispatch<SetStateAction<string | null>>;
  setSaveSuccess: Dispatch<SetStateAction<boolean>>;
  customFields: CustomField[];
  setCustomFields: Dispatch<SetStateAction<CustomField[]>>;
  newCustomFieldName: string;
  setNewCustomFieldName: Dispatch<SetStateAction<string>>;
  newCustomFieldType: "text" | "textarea";
  setNewCustomFieldType: Dispatch<SetStateAction<"text" | "textarea">>;
  personalInfoForm: PersonalInfoFormState;
  setPersonalInfoForm: Dispatch<SetStateAction<PersonalInfoFormState>>;
}

export function useResumeHandlers({
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
  setPersonalInfoForm,
}: UseResumeHandlersParams) {
  const {
    updatePersonalInfo,
    addCustomField,
    updateCustomField,
    removeCustomField,
    addDynamicSectionEntry,
    updateDynamicSectionEntry,
    removeDynamicSectionEntry,
    removeDynamicSection,
    updateDynamicSection,
  } = useGlobalStore();

  // Dynamic section editing state
  const [editingDynamicEntry, setEditingDynamicEntry] = useState<{
    sectionId: string;
    entryId: string;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dynamicEntryForm, setDynamicEntryForm] = useState<Record<string, any>>(
    {}
  );
  const [editingSectionTitle, setEditingSectionTitle] = useState<string | null>(
    null
  );
  const [sectionTitleForm, setSectionTitleForm] = useState("");

  const isBaseSectionType = (type: SectionType) =>
    type === "education" || type === "experience" || type === "skills";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entryData: Record<string, any>
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
            return {
              ...s,
              entries: [
                ...s.entries,
                {
                  id: editingDynamicEntry.entryId,
                  ...dynamicEntryForm,
                } as Entry & Record<string, unknown>,
              ],
            };
          } else {
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
    } as Parameters<typeof addCustomField>[0]);

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

    updateCustomField(fieldId, {
      enabled: nextEnabled,
    } as Parameters<typeof updateCustomField>[1]);
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

  const handleEditSectionTitle = (
    sectionId: string,
    currentTitle: string
  ) => {
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

  return {
    // State
    editingDynamicEntry,
    setEditingDynamicEntry,
    dynamicEntryForm,
    setDynamicEntryForm,
    editingSectionTitle,
    setEditingSectionTitle,
    sectionTitleForm,
    setSectionTitleForm,
    // Handlers
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
  };
}
