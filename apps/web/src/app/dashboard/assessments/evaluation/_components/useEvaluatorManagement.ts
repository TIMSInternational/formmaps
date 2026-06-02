"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useEvaluationData } from "@/hooks/useEvaluationData";
import {
  EvaluatorGroup,
  Evaluator,
  createEvaluationGroup,
  getUserEvaluationGroups,
  resendInvitationLink,
  sendBulkEmailInvitations,
  sendSelectedEmailInvitations,
  checkDuplicateEvaluator,
  validatePhoneNumber,
  EvaluationGroupWithId,
} from "@/services/evaluationService";
import { NewEvaluatorForm } from "./AddEvaluatorDialog";

export function useEvaluatorManagement() {
  const { user, language } = useGlobalStore();
  const { t } = useTranslation();
  const { isLoading, currentSession } = useEvaluationData();

  const DEFAULT_EVALUATOR_GROUPS: EvaluatorGroup[] = [
    {
      id: "parent",
      name: t("dashboard.parent"),
      type: "parent",
      minRequired: 1,
      maxAllowed: 2,
      evaluators: [],
    },
    {
      id: "teacher",
      name: t("dashboard.teacher"),
      type: "teacher",
      minRequired: 1,
      maxAllowed: 3,
      evaluators: [],
    },
    {
      id: "sibling_friend",
      name: t("dashboard.siblingFriend"),
      type: "sibling_friend",
      minRequired: 1,
      maxAllowed: 3,
      evaluators: [],
    },
  ];

  const [evaluatorGroups, setEvaluatorGroups] = useState<EvaluatorGroup[]>(
    DEFAULT_EVALUATOR_GROUPS
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [newEvaluator, setNewEvaluator] = useState<NewEvaluatorForm>({
    name: "",
    email: "",
    phone: "",
    relationship: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiEvaluators, setApiEvaluators] = useState<EvaluationGroupWithId[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [selectedEvaluator, setSelectedEvaluator] = useState<string | null>(
    null
  );
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [emailSendMode, setEmailSendMode] = useState<"all" | "specific">("all");
  const [smsSendMode, setSmsSendMode] = useState<"all" | "specific">("all");
  const [selectedEvaluatorsForEmail, setSelectedEvaluatorsForEmail] = useState<
    string[]
  >([]);
  const [selectedEvaluatorsForSMS, setSelectedEvaluatorsForSMS] = useState<
    string[]
  >([]);
  const [showEmailSelector, setShowEmailSelector] = useState(false);
  const [showSMSSelector, setShowSMSSelector] = useState(false);

  const loadApiEvaluators = async () => {
    try {
      if (user?.id) {
        const result = await getUserEvaluationGroups(user.id, language);
        setApiEvaluators(result || []);
        if (result && result.length > 0) {
          mergeApiDataIntoGroups(result);
        }
      }
    } catch (error) {
      // error handled silently
    }
  };

  const mergeApiDataIntoGroups = (apiData: EvaluationGroupWithId[]) => {
    const updatedGroups = DEFAULT_EVALUATOR_GROUPS.map((g) => ({
      ...g,
      evaluators: [...g.evaluators],
    }));

    apiData.forEach((apiEvaluator: EvaluationGroupWithId) => {
      const groupType = apiEvaluator.groupType?.toLowerCase();
      let targetGroupId = "";

      switch (groupType) {
        case "parent":
          targetGroupId = "parent";
          break;
        case "teacher":
          targetGroupId = "teacher";
          break;
        case "siblingfriend":
        case "sibling_friend":
        case "sibling":
        case "friend":
          targetGroupId = "sibling_friend";
          break;
        default: {
          const matchingGroup = updatedGroups.find(
            (g) =>
              g.name.toLowerCase().includes(groupType) ||
              groupType.includes(g.name.toLowerCase())
          );
          if (matchingGroup) {
            targetGroupId = matchingGroup.id;
          }
        }
      }

      const targetGroup = updatedGroups.find((g) => g.id === targetGroupId);
      if (targetGroup) {
        const existsInGroup = targetGroup.evaluators.find(
          (e) => e.email === apiEvaluator.evaluatorEmail
        );
        if (!existsInGroup) {
          const ev: Evaluator = {
            id: apiEvaluator.id,
            name: apiEvaluator.evaluatorName,
            email: apiEvaluator.evaluatorEmail,
            phone: "Not provided",
            relationship: apiEvaluator.relation || "",
            groupType: targetGroup.type,
            groupId: apiEvaluator.id,
            invitationToken: apiEvaluator.invitationToken || "",
            invitationSent: apiEvaluator.isEmailSent || false,
            responseReceived: apiEvaluator.isEvaluationCompleted || false,
            isActive: !apiEvaluator.isTokenUsed,
          };
          targetGroup.evaluators.push(ev);
        }
      }
    });

    setEvaluatorGroups(updatedGroups);
  };

  useEffect(() => {
    if (currentSession?.evaluatorGroups) {
      setEvaluatorGroups(currentSession.evaluatorGroups);
    }
    if (user?.id) {
      loadApiEvaluators();
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showDropdown && !target.closest(".dropdown-container")) {
        setShowDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [currentSession, user, showDropdown]);

  useEffect(() => {
    if (currentSession?.evaluatorGroups) {
      setEvaluatorGroups(currentSession.evaluatorGroups);
    }
  }, [currentSession]);

  const getTotalEvaluators = () =>
    evaluatorGroups.reduce(
      (total, group) => total + group.evaluators.length,
      0
    );

  const areAllGroupsComplete = () =>
    evaluatorGroups.every(
      (group) => group.evaluators.length >= group.minRequired
    );

  const requiresRelationship = (groupType: string) => groupType !== "teacher";

  const validateEvaluatorForm = async () => {
    const newErrors: Record<string, string> = {};

    if (!newEvaluator.name.trim()) newErrors.name = "Name is required";
    if (!newEvaluator.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEvaluator.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (newEvaluator.phone.trim()) {
      const phoneValidation = validatePhoneNumber(newEvaluator.phone);
      if (!phoneValidation.isValid) {
        newErrors.phone =
          phoneValidation.error || "Invalid phone number format";
      }
    }

    if (!selectedGroup) newErrors.group = "Please select an evaluator group";

    const selectedGroupType = evaluatorGroups.find(
      (g) => g.id === selectedGroup
    )?.type;
    if (
      selectedGroupType &&
      requiresRelationship(selectedGroupType) &&
      !newEvaluator.relationship.trim()
    ) {
      newErrors.relationship = "Relationship is required";
    }

    const allCurrentEvaluators = evaluatorGroups.flatMap((g) => g.evaluators);
    const duplicateEmail = allCurrentEvaluators.find(
      (e) => e.email.toLowerCase() === newEvaluator.email.toLowerCase()
    );
    if (duplicateEmail) {
      newErrors.email = "This email is already used by another evaluator";
    }

    const duplicatePhone =
      newEvaluator.phone &&
      allCurrentEvaluators.find(
        (e) =>
          e.phone &&
          e.phone.replace(/[\s\-\(\)]/g, "") ===
            newEvaluator.phone.replace(/[\s\-\(\)]/g, "")
      );
    if (duplicatePhone) {
      newErrors.phone =
        "This phone number is already used by another evaluator";
    }

    if (!newErrors.email && newEvaluator.email) {
      try {
        const duplicateCheck = await checkDuplicateEvaluator(
          newEvaluator.email,
          newEvaluator.phone || ""
        );
        if (duplicateCheck.isDuplicate && duplicateCheck.existingEvaluator) {
          const existing = duplicateCheck.existingEvaluator;
          if (
            duplicateCheck.duplicateField === "email" ||
            duplicateCheck.duplicateField === "both"
          ) {
            newErrors.email = `Email already used by ${existing.name} in ${existing.groupType} group`;
          }
          if (
            newEvaluator.phone &&
            (duplicateCheck.duplicateField === "phone" ||
              duplicateCheck.duplicateField === "both")
          ) {
            newErrors.phone = `Phone number already used by ${existing.name} in ${existing.groupType} group`;
          }
        }
      } catch (error) {
        // Continue without duplicate check from API if it fails
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openAddModal = (groupId?: string) => {
    if (groupId) setSelectedGroup(groupId);
    setShowAddModal(true);
  };

  const handleAddEvaluator = async () => {
    if (!(await validateEvaluatorForm())) return;

    const group = evaluatorGroups.find((g) => g.id === selectedGroup);
    if (!group) return;

    const isEditing = !!selectedEvaluator;

    if (!isEditing && group.evaluators.length >= group.maxAllowed) {
      setErrors({
        group: `Maximum ${group.maxAllowed} evaluators allowed for ${group.name}`,
      });
      return;
    }

    setLoading(true);

    try {
      if (user?.id) {
        const apiGroupType =
          selectedGroup === "parent"
            ? "Parent"
            : selectedGroup === "teacher"
            ? "Teacher"
            : "SiblingFriend";

        const relationValue =
          selectedGroup === "teacher" && !newEvaluator.relationship.trim()
            ? "Teacher"
            : newEvaluator.relationship;

        if (isEditing) {
          toast.success(
            "Evaluator details updated successfully! Note: API update functionality will be implemented soon."
          );
        } else {
          await createEvaluationGroup({
            evaluatorName: newEvaluator.name,
            evaluatorEmail: newEvaluator.email,
            relation: relationValue,
            groupType: apiGroupType as any,
            evaluatedUserId: user.id,
          });
        }

        await loadApiEvaluators();
      }
    } catch (error) {
      setErrors({
        general: `Failed to ${isEditing ? "update" : "create"} evaluator. Please try again.`,
      });
      setLoading(false);
      return;
    }

    const selectedGroupType =
      evaluatorGroups.find((g) => g.id === selectedGroup)?.type || "parent";

    if (isEditing) {
      const updatedGroups = evaluatorGroups.map((g) =>
        g.id === selectedGroup
          ? {
              ...g,
              evaluators: g.evaluators.map((e) =>
                e.id === selectedEvaluator
                  ? {
                      ...e,
                      name: newEvaluator.name,
                      email: newEvaluator.email,
                      phone: newEvaluator.phone,
                      relationship: newEvaluator.relationship,
                    }
                  : e
              ),
            }
          : g
      );
      setEvaluatorGroups(updatedGroups);
    } else {
      const evaluator: Evaluator = {
        id: Date.now().toString(),
        name: newEvaluator.name,
        email: newEvaluator.email,
        phone: newEvaluator.phone,
        relationship: newEvaluator.relationship,
        groupType: selectedGroupType,
        groupId: selectedGroup,
        invitationToken: "",
        invitationSent: false,
        responseReceived: false,
        isActive: true,
      };

      const updatedGroups = evaluatorGroups.map((g) =>
        g.id === selectedGroup
          ? { ...g, evaluators: [...g.evaluators, evaluator] }
          : g
      );
      setEvaluatorGroups(updatedGroups);
    }

    setNewEvaluator({ name: "", email: "", phone: "", relationship: "" });
    setSelectedGroup("");
    setSelectedEvaluator(null);
    setShowAddModal(false);
    setErrors({});
    setLoading(false);
  };

  const handleRemoveEvaluator = async (
    groupId: string,
    evaluatorId: string
  ) => {
    try {
      const updatedGroups = evaluatorGroups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              evaluators: g.evaluators.filter((e) => e.id !== evaluatorId),
            }
          : g
      );
      setEvaluatorGroups(updatedGroups);
      await loadApiEvaluators();
      toast.success("Evaluator removed successfully!");
    } catch (error) {
      toast.error("Error removing evaluator. Please try again.");
    }
  };

  const handleEditEvaluator = (evaluator: Evaluator) => {
    setNewEvaluator({
      name: evaluator.name,
      email: evaluator.email,
      phone: evaluator.phone,
      relationship: evaluator.relationship,
    });
    const group = evaluatorGroups.find((g) =>
      g.evaluators.some((e) => e.id === evaluator.id)
    );
    if (group) setSelectedGroup(group.id);
    setSelectedEvaluator(evaluator.id);
    setShowAddModal(true);
  };

  const handleResendEmailLink = async (evaluatorId: string) => {
    try {
      await resendInvitationLink(evaluatorId);
      toast.success(t("evaluation.toast.emailSent"));
      await loadApiEvaluators();
    } catch (error) {
      toast.error(t("evaluation.toast.emailFailed"));
    }
  };

  const handleResendPhoneLink = async (
    evaluatorId: string,
    phoneNumber: string
  ) => {
    if (!phoneNumber || phoneNumber === "Not provided") {
      toast.error("Phone number is not available for this evaluator.");
      return;
    }
    toast.info(
      `SMS invitation would be sent to ${phoneNumber}. SMS functionality coming soon!`
    );
  };

  const handleSendEmailInvitations = async () => {
    if (getTotalEvaluators() === 0) return;
    if (!areAllGroupsComplete()) {
      toast.error(t("evaluation.toast.groupsIncomplete"));
      return;
    }

    try {
      setLoading(true);
      let result;
      if (emailSendMode === "all") {
        result = await sendBulkEmailInvitations(user?.id || "");
      } else {
        const selectedIds =
          selectedEvaluatorsForEmail.length > 0
            ? selectedEvaluatorsForEmail
            : apiEvaluators.map((group) => group.id);
        result = await sendSelectedEmailInvitations(selectedIds);
      }

      if (result.success) {
        toast.success(
          result.message || "Email invitations sent successfully!"
        );
      } else {
        toast.warning(t("evaluation.toast.emailPartial"));
      }
      await loadApiEvaluators();
    } catch (error) {
      toast.error(t("evaluation.toast.emailFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSendSMSInvitations = async () => {
    if (getTotalEvaluators() === 0) return;
    if (!areAllGroupsComplete()) {
      toast.error(t("evaluation.toast.groupsIncomplete"));
      return;
    }

    try {
      setLoading(true);
      let evaluatorsWithPhone;
      if (smsSendMode === "all") {
        const allEvaluators = evaluatorGroups.flatMap((g) => g.evaluators);
        evaluatorsWithPhone = allEvaluators.filter(
          (e) => e.phone && e.phone !== "Not provided"
        );
      } else {
        const selectedGroups = evaluatorGroups.filter((group) =>
          selectedEvaluatorsForSMS.includes(group.id)
        );
        evaluatorsWithPhone = selectedGroups
          .flatMap((g) => g.evaluators)
          .filter((e) => e.phone && e.phone !== "Not provided");
      }

      if (evaluatorsWithPhone.length === 0) {
        toast.warning(t("evaluation.toast.noPhoneNumbers"));
        setLoading(false);
        return;
      }

      toast.info(
        t("evaluation.toast.smsComingSoon") +
          ` (${evaluatorsWithPhone.length} ${t("dashboard.evaluationEvaluators")})`
      );
    } catch (error) {
      toast.error("Error sending SMS invitations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelModal = () => {
    setShowAddModal(false);
    setErrors({});
    setNewEvaluator({ name: "", email: "", phone: "", relationship: "" });
    setSelectedGroup("");
    setSelectedEvaluator(null);
  };

  return {
    // State
    evaluatorGroups,
    showAddModal,
    setShowAddModal,
    selectedGroup,
    setSelectedGroup,
    newEvaluator,
    setNewEvaluator,
    errors,
    apiEvaluators,
    loading,
    selectedEvaluator,
    showDropdown,
    setShowDropdown,
    emailSendMode,
    setEmailSendMode,
    smsSendMode,
    setSmsSendMode,
    selectedEvaluatorsForEmail,
    setSelectedEvaluatorsForEmail,
    selectedEvaluatorsForSMS,
    setSelectedEvaluatorsForSMS,
    showEmailSelector,
    setShowEmailSelector,
    showSMSSelector,
    setShowSMSSelector,
    user,
    // Computed
    getTotalEvaluators,
    areAllGroupsComplete,
    // Handlers
    openAddModal,
    handleAddEvaluator,
    handleRemoveEvaluator,
    handleEditEvaluator,
    handleResendEmailLink,
    handleResendPhoneLink,
    handleSendEmailInvitations,
    handleSendSMSInvitations,
    handleCancelModal,
  };
}
