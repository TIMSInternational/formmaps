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
  updateEvaluationGroup,
  deleteEvaluationGroup,
  getUserEvaluationGroups,
  resendInvitationLink,
  sendBulkEmailInvitations,
  sendSelectedEmailInvitations,
  validatePhoneNumber,
  EvaluationGroupWithId,
} from "@/services/evaluationService";
import { NewEvaluatorForm } from "./AddEvaluatorDialog";
import { toStoreLanguage, useContentLanguage } from "@/lib/i18n/contentLanguage";

export function useEvaluatorManagement() {
  const { user } = useGlobalStore();
  const language = toStoreLanguage(useContentLanguage());
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
        // Also when empty: removing the last evaluator must clear the list.
        mergeApiDataIntoGroups(result || []);
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
            // isTokenUsed = the rater opened their link; from then on they can't be edited or removed.
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

    if (!newEvaluator.name.trim()) newErrors.name = t("evaluation.validation.nameRequired");
    if (!newEvaluator.email.trim()) {
      newErrors.email = t("evaluation.validation.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEvaluator.email)) {
      newErrors.email = t("evaluation.validation.emailInvalid");
    }

    if (newEvaluator.phone.trim()) {
      const phoneValidation = validatePhoneNumber(newEvaluator.phone);
      if (!phoneValidation.isValid) {
        // validatePhoneNumber's own messages are English-only; show the
        // translated one instead.
        newErrors.phone = t("evaluation.validation.phoneInvalid");
      }
    }

    if (!selectedGroup) newErrors.group = t("evaluation.validation.groupRequired");

    const selectedGroupType = evaluatorGroups.find(
      (g) => g.id === selectedGroup
    )?.type;
    if (
      selectedGroupType &&
      requiresRelationship(selectedGroupType) &&
      !newEvaluator.relationship.trim()
    ) {
      newErrors.relationship = t("evaluation.validation.relationshipRequired");
    }

    const allCurrentEvaluators = evaluatorGroups.flatMap((g) => g.evaluators);
    const duplicateEmail = allCurrentEvaluators.find(
      (e) => e.email.toLowerCase() === newEvaluator.email.toLowerCase()
    );
    if (duplicateEmail) {
      newErrors.email = t("evaluation.validation.emailDuplicate");
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
      newErrors.phone = t("evaluation.validation.phoneDuplicate");
    }

    // NOTE: no remote duplicate check — /evaluation/check-duplicate does not
    // exist on the backend (always 404'd). Local checks above + the server's
    // 409 on create-group cover duplicates.

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
        group: t("evaluation.validation.maxReached", {
          max: group.maxAllowed,
          group: group.name,
        }),
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

        if (isEditing && selectedEvaluator) {
          // Audit 2026-10-09 C5: edits used to change only the screen. A corrected email gets a fresh link
          // (the server rotates the token, so the one sent to the wrong address stops working).
          const updated = await updateEvaluationGroup(selectedEvaluator, {
            evaluatorName: newEvaluator.name,
            evaluatorEmail: newEvaluator.email,
            relation: relationValue,
            groupType: apiGroupType as any,
            evaluatedUserId: user.id,
          });
          const resent = (updated as { data?: { invitationResent?: boolean } })?.data?.invitationResent;
          toast.success(resent
            ? t("evaluation.toast.evalUpdatedResent", { email: newEvaluator.email })
            : t("evaluation.toast.evalUpdated"));
        } else {
          const created = await createEvaluationGroup({
            evaluatorName: newEvaluator.name,
            evaluatorEmail: newEvaluator.email,
            relation: relationValue,
            groupType: apiGroupType as any,
            evaluatedUserId: user.id,
          });
          // The invitation email is now sent on create (parity with the other
          // invite flows). Confirm delivery, or tell the student to use Resend
          // if the mailer couldn't deliver it.
          const emailSent = (created as { emailSent?: boolean })?.emailSent;
          toast.success(
            emailSent === false
              ? t("evaluation.toast.inviteEmailFailed", { name: newEvaluator.name })
              : t("evaluation.toast.inviteSent", { name: newEvaluator.name })
          );
        }

        await loadApiEvaluators();
      }
    } catch (error) {
      const started = (error as { data?: { code?: string } })?.data?.code === "EVALUATION_STARTED";
      setErrors({
        general: started
          ? t("evaluation.toast.evalLocked")
          : isEditing
            ? t("evaluation.validation.updateFailed")
            : t("evaluation.evaluatorManagement.failedAdd"),
      });
      setLoading(false);
      return;
    }

    // The list was reloaded from the API above — it is the source of truth (ids included), so no
    // locally-fabricated rows are patched in any more.
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
      // Audit 2026-10-09 C5: this only hid the row; the rater stayed invited and came back on reload.
      await deleteEvaluationGroup(evaluatorId);
      setEvaluatorGroups((groups) => groups.map((g) =>
        g.id === groupId ? { ...g, evaluators: g.evaluators.filter((e) => e.id !== evaluatorId) } : g
      ));
      await loadApiEvaluators();
      toast.success(t("evaluation.toast.evalRemoved"));
    } catch (error) {
      const started = (error as { data?: { code?: string } })?.data?.code === "EVALUATION_STARTED";
      toast.error(started ? t("evaluation.toast.evalLocked") : t("evaluation.toast.evalRemoveFailed"));
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
      toast.error(t("evaluation.toast.noPhone"));
      return;
    }
    toast.info(t("evaluation.toast.smsPreview", { phone: phoneNumber }));
  };

  // `mode` is passed explicitly: "Send to all" set the mode in state and called this in the same tick, so it
  // read the PREVIOUS mode and could send only the last selection (audit 2026-10-09 C5).
  const handleSendEmailInvitations = async (mode: "all" | "specific" = emailSendMode) => {
    if (getTotalEvaluators() === 0) return;
    if (!areAllGroupsComplete()) {
      toast.error(t("evaluation.toast.groupsIncomplete"));
      return;
    }

    try {
      setLoading(true);
      let result;
      if (mode === "all") {
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
          result.message || t("evaluation.toast.emailsSent")
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
      toast.error(t("evaluation.toast.smsFailed"));
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
