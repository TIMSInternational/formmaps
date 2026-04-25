"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useEvaluationData } from "@/hooks/useEvaluationData";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  EvaluatorGroup,
  Evaluator,
  createEvaluationGroup,
  getUserEvaluationGroups,
  deleteEvaluationGroup,
  resendInvitationLink,
  sendBulkEmailInvitations,
  sendSelectedEmailInvitations,
  checkDuplicateEvaluator,
  validatePhoneNumber,
  EvaluationGroupProgress,
  EvaluationGroupWithId,
} from "@/services/evaluationService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function EvaluatorsPage() {
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
  const [newEvaluator, setNewEvaluator] = useState({
    name: "",
    email: "",
    phone: "",
    relationship: "",
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
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

  useEffect(() => {
    if (currentSession?.evaluatorGroups) {
      setEvaluatorGroups(currentSession.evaluatorGroups);
    }
    if (user?.id) {
      loadApiEvaluators();
    }

    // Add click outside handler
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showDropdown && !target.closest(".dropdown-container")) {
        setShowDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [currentSession, user, showDropdown]);

  const loadApiEvaluators = async () => {
    try {
      if (user?.id) {
        const apiEvaluators = await getUserEvaluationGroups(user.id, language);
        setApiEvaluators(apiEvaluators || []);

        // Merge API data into evaluator groups
        if (apiEvaluators && apiEvaluators.length > 0) {
          mergeApiDataIntoGroups(apiEvaluators);
        }
      }
    } catch (error) {
      // error handled silently
    }
  };

  const mergeApiDataIntoGroups = (apiData: EvaluationGroupWithId[]) => {
    const updatedGroups = [...DEFAULT_EVALUATOR_GROUPS];

    apiData.forEach((apiEvaluator: EvaluationGroupWithId) => {
      const groupType = apiEvaluator.groupType?.toLowerCase();
      let targetGroupId = "";

      // Map API group types to our local group IDs
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
        default:
          // Try to match by group type name
          const matchingGroup = updatedGroups.find(
            (g) =>
              g.name.toLowerCase().includes(groupType) ||
              groupType.includes(g.name.toLowerCase())
          );
          if (matchingGroup) {
            targetGroupId = matchingGroup.id;
          }
      }

      const targetGroup = updatedGroups.find((g) => g.id === targetGroupId);
      if (targetGroup) {
        // Check if evaluator already exists (avoid duplicates)
        const existsInGroup = targetGroup.evaluators.find(
          (e) => e.email === apiEvaluator.evaluatorEmail
        );

        if (!existsInGroup) {
          const newEvaluator: Evaluator = {
            id: apiEvaluator.id, // Use the actual group ID from API
            name: apiEvaluator.evaluatorName,
            email: apiEvaluator.evaluatorEmail,
            phone: "Not provided", // API doesn't return phone number
            relationship: apiEvaluator.relation || "",
            groupType: targetGroup.type,
            groupId: apiEvaluator.id, // Set groupId to the same as id since each evaluator is a group
            invitationToken: apiEvaluator.invitationToken || "",
            invitationSent: apiEvaluator.isEmailSent || false,
            responseReceived: apiEvaluator.isEvaluationCompleted || false,
            isActive: !apiEvaluator.isTokenUsed,
          };
          targetGroup.evaluators.push(newEvaluator);
        }
      }
    });

    setEvaluatorGroups(updatedGroups);
  };

  useEffect(() => {
    if (currentSession?.evaluatorGroups) {
      setEvaluatorGroups(currentSession.evaluatorGroups);
    }
  }, [currentSession]);

  const validateEvaluator = async () => {
    const newErrors: { [key: string]: string } = {};

    if (!newEvaluator.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!newEvaluator.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEvaluator.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Phone is now optional
    if (newEvaluator.phone.trim()) {
      // Validate phone number format with country code if provided
      const phoneValidation = validatePhoneNumber(newEvaluator.phone);
      if (!phoneValidation.isValid) {
        newErrors.phone =
          phoneValidation.error || "Invalid phone number format";
      }
    }

    if (!selectedGroup) {
      newErrors.group = "Please select an evaluator group";
    }

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

    // Check for duplicates in local evaluators
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

    // Check for duplicates in API (email is required, phone is optional)
    if (!newErrors.email && newEvaluator.email) {
      try {
        const duplicateCheck = await checkDuplicateEvaluator(
          newEvaluator.email,
          newEvaluator.phone || "" // Pass empty string if no phone provided
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
    if (groupId) {
      setSelectedGroup(groupId);
    }
    setShowAddModal(true);
  };

  const handleAddEvaluator = async () => {
    if (!(await validateEvaluator())) return;

    const group = evaluatorGroups.find((g) => g.id === selectedGroup);
    if (!group) return;

    // Check if we're editing or adding new
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

        // For teachers, use "Teacher" as the relation if no specific relationship is provided
        const relationValue =
          selectedGroup === "teacher" && !newEvaluator.relationship.trim()
            ? "Teacher"
            : newEvaluator.relationship;

        if (isEditing) {
          // TODO: Implement update evaluator API when available
          toast.success(
            "Evaluator details updated successfully! Note: API update functionality will be implemented soon."
          );
        } else {
          // Create new evaluator via API
          const apiResult = await createEvaluationGroup({
            evaluatorName: newEvaluator.name,
            evaluatorEmail: newEvaluator.email,
            relation: relationValue,
            groupType: apiGroupType as any,
            evaluatedUserId: user.id,
          });

        }

        // Reload API evaluators
        await loadApiEvaluators();
      }
    } catch (error) {
      setErrors({
        general: `Failed to ${
          isEditing ? "update" : "create"
        } evaluator. Please try again.`,
      });
      setLoading(false);
      return;
    }

    const selectedGroupType =
      evaluatorGroups.find((g) => g.id === selectedGroup)?.type || "parent";

    if (isEditing) {
      // Update existing evaluator in local state
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
      // Add new evaluator to local state
      const evaluator: Evaluator = {
        id: Date.now().toString(),
        name: newEvaluator.name,
        email: newEvaluator.email,
        phone: newEvaluator.phone,
        relationship: newEvaluator.relationship,
        groupType: selectedGroupType,
        groupId: selectedGroup,
        invitationToken: "",
        invitationSent: false, // Invitation not sent yet
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

    // Reset form and close modal
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
      // TODO: Implement delete evaluator API endpoint
      // await deleteEvaluator(evaluatorId);

      // For now, just update the UI locally
      const updatedGroups = evaluatorGroups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              evaluators: g.evaluators.filter((e) => e.id !== evaluatorId),
            }
          : g
      );
      setEvaluatorGroups(updatedGroups);

      // Reload API evaluators
      await loadApiEvaluators();

      toast.success("Evaluator removed successfully!");
    } catch (error) {
      toast.error("Error removing evaluator. Please try again.");
    }
  };

  const handleResendLink = async (evaluatorId: string) => {
    try {
      await resendInvitationLink(evaluatorId);
      toast.success(t("evaluation.toast.resendSuccess"));

      // Reload API evaluators to update status
      await loadApiEvaluators();
    } catch (error) {
      toast.error(t("evaluation.toast.resendError"));
    }
  };

  const handleEditEvaluator = (evaluator: Evaluator) => {
    // Set the evaluator data for editing
    setNewEvaluator({
      name: evaluator.name,
      email: evaluator.email,
      phone: evaluator.phone,
      relationship: evaluator.relationship,
    });

    // Find and set the group
    const group = evaluatorGroups.find((g) =>
      g.evaluators.some((e) => e.id === evaluator.id)
    );
    if (group) {
      setSelectedGroup(group.id);
    }

    // Store the evaluator being edited
    setSelectedEvaluator(evaluator.id);

    // Open the modal
    setShowAddModal(true);
  };

  const handleResendEmailLink = async (evaluatorId: string) => {
    try {
      await resendInvitationLink(evaluatorId);
      toast.success(t("evaluation.toast.emailSent"));

      // Reload API evaluators to update status
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

    try {
      // TODO: Implement SMS invitation API when available
      // For now, show a placeholder message
      toast.info(
        `SMS invitation would be sent to ${phoneNumber}. SMS functionality coming soon!`
      );

      // When SMS API is available, uncomment and implement:
      // await sendSMSInvitation(evaluatorId, phoneNumber);
      // toast.success("SMS invitation sent successfully!");
      // await loadApiEvaluators();
    } catch (error) {
      toast.error("Error sending SMS invitation. Please try again.");
    }
  };

  const handleSendEmailInvitations = async () => {
    if (getTotalEvaluators() === 0) {
      setLoading(false);
      return;
    }

    if (!areAllGroupsComplete()) {
      toast.error(t("evaluation.toast.groupsIncomplete"));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let result;
      if (emailSendMode === "all") {
        // Use the bulk email invitation API - let the API decide what needs to be sent
        result = await sendBulkEmailInvitations(user?.id || "");
      } else {
        // Send to selected evaluators
        const selectedIds =
          selectedEvaluatorsForEmail.length > 0
            ? selectedEvaluatorsForEmail
            : apiEvaluators.map((group) => group.id);
        result = await sendSelectedEmailInvitations(selectedIds);
      }

      if (result.success) {
        toast.success(result.message || `Email invitations sent successfully!`);
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
        // Filter selected evaluators that have phone numbers
        const selectedGroups = evaluatorGroups.filter((group) =>
          selectedEvaluatorsForSMS.includes(group.id)
        );
        const selectedEvaluators = selectedGroups.flatMap((g) => g.evaluators);
        evaluatorsWithPhone = selectedEvaluators.filter(
          (e) => e.phone && e.phone !== "Not provided"
        );
      }

      if (evaluatorsWithPhone.length === 0) {
        toast.warning(t("evaluation.toast.noPhoneNumbers"));
        setLoading(false);
        return;
      }

      // TODO: Implement SMS invitation API when available
      toast.info(
        t("evaluation.toast.smsComingSoon") +
          ` (${evaluatorsWithPhone.length} ${t(
            "dashboard.evaluationEvaluators"
          )})`
      );
    } catch (error) {
      toast.error("Error sending SMS invitations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDropdown = (evaluatorId: string) => {
    setShowDropdown(showDropdown === evaluatorId ? null : evaluatorId);
  };

  const getTotalEvaluators = () => {
    return evaluatorGroups.reduce(
      (total, group) => total + group.evaluators.length,
      0
    );
  };

  const areAllGroupsComplete = () => {
    return evaluatorGroups.every(
      (group) => group.evaluators.length >= group.minRequired
    );
  };

  const getRelationshipOptions = (groupType: string) => {
    switch (groupType) {
      case "parent":
        return [
          "Mother",
          "Father",
          "Guardian",
          "Step-parent",
          "Grandparent",
          "Other Family",
        ];
      case "sibling_friend":
        return [
          "Older Brother",
          "Younger Brother",
          "Older Sister",
          "Younger Sister",
          "Best Friend",
          "Close Friend",
          "Classmate",
          "Neighbor",
        ];
      default:
        return ["Colleague", "Mentor", "Supervisor", "Other"];
    }
  };

  const requiresRelationship = (groupType: string) => {
    return groupType !== "teacher";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="flex mb-6" aria-label="Breadcrumb">
          <ol className="inline-flex items-center space-x-1 md:space-x-3">
            <li className="inline-flex items-center">
              <a
                href="/dashboard"
                className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-blue-600"
              >
                Dashboard
              </a>
            </li>
            <li>
              <div className="flex items-center">
                <svg
                  className="w-6 h-6 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <a
                  href="/dashboard/assessments"
                  className="ml-1 text-sm font-medium text-gray-700 hover:text-blue-600 md:ml-2"
                >
                  Assessments
                </a>
              </div>
            </li>
            <li>
              <div className="flex items-center">
                <svg
                  className="w-6 h-6 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="ml-1 text-sm font-medium text-gray-500 md:ml-2">
                  Invite Evaluators
                </span>
              </div>
            </li>
          </ol>
        </nav>

        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </motion.div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Invite Evaluators
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Add evaluators from different groups to get comprehensive feedback
            for your 360-degree evaluation.
          </p>
        </div>

        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6 mb-8"
        >
          <div className="flex items-center flex-col md:flex-row gap-4 justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Evaluation Progress
              </h3>
              <p className="text-gray-600">
                {getTotalEvaluators()} evaluators added across{" "}
                {evaluatorGroups.length} groups
              </p>
            </div>
            <div className="flex flex-col md:flex-row gap-4 space-x-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={
                      getTotalEvaluators() === 0 || !areAllGroupsComplete()
                    }
                    className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none flex items-center space-x-2"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                      />
                    </svg>
                    <span>Send Email Invitations</span>
                    <svg
                      className="w-4 h-4 ml-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => {
                      setEmailSendMode("all");
                      handleSendEmailInvitations();
                    }}
                  >
                    Send to All
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setEmailSendMode("specific");
                      setShowEmailSelector(true);
                    }}
                  >
                    Send to Specific
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={
                      getTotalEvaluators() === 0 || !areAllGroupsComplete()
                    }
                    className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none flex items-center space-x-2"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                    <span>Send SMS Invitations</span>
                    <svg
                      className="w-4 h-4 ml-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => {
                      setSmsSendMode("all");
                      handleSendSMSInvitations();
                    }}
                  >
                    Send to All
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSmsSendMode("specific");
                      setShowSMSSelector(true);
                    }}
                  >
                    Send to Specific
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </motion.div>

        {/* Evaluator Groups */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {evaluatorGroups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {group.name}
                  </h3>
                  <p className="text-gray-600">
                    {group.evaluators.length} of {group.maxAllowed} evaluators
                    added
                    {group.minRequired > 0 &&
                      ` (minimum ${group.minRequired} required)`}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium shadow-sm ${
                      group.evaluators.length >= group.minRequired
                        ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border border-green-200"
                        : "bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {group.evaluators.length >= group.minRequired
                      ? "Complete"
                      : "Incomplete"}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <button
                  onClick={() => openAddModal(group.id)}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-4 py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl disabled:shadow-none"
                  disabled={group.evaluators.length >= group.maxAllowed}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  <span>Add {group.name}</span>
                </button>
              </div>

              {group.evaluators.filter(
                (evaluator) => evaluator.relationship !== "Self"
              ).length > 0 ? (
                <div className="space-y-3">
                  {group.evaluators
                    .filter((evaluator) => evaluator.relationship !== "Self")
                    .map((evaluator) => (
                      <div
                        key={evaluator.id}
                        className="relative p-4 bg-gradient-to-r from-gray-50 to-blue-50/30 rounded-xl border border-gray-100 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 text-lg mb-1">
                                  {evaluator.name}
                                </h4>
                                <p className="text-sm text-gray-600 mb-1">
                                  <span className="inline-flex items-center">
                                    <svg
                                      className="w-4 h-4 mr-1"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                                      />
                                    </svg>
                                    {evaluator.email ||
                                      (user?.email &&
                                      evaluator.relationship === "Self"
                                        ? user.email
                                        : "No email provided")}
                                  </span>
                                </p>
                                <p className="text-sm text-gray-600">
                                  <span className="inline-flex items-center">
                                    <svg
                                      className="w-4 h-4 mr-1"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                      />
                                    </svg>
                                    {evaluator.phone}
                                  </span>
                                </p>
                              </div>
                              <div className="relative dropdown-container">
                                <button
                                  onClick={() => toggleDropdown(evaluator.id)}
                                  className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                                >
                                  <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                    />
                                  </svg>
                                </button>

                                {showDropdown === evaluator.id && (
                                  <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-lg border z-50">
                                    <div className="py-1">
                                      <button
                                        onClick={() => {
                                          handleEditEvaluator(evaluator);
                                          setShowDropdown(null);
                                        }}
                                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                      >
                                        <svg
                                          className="w-4 h-4 mr-2"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                          />
                                        </svg>
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleResendEmailLink(evaluator.id);
                                          setShowDropdown(null);
                                        }}
                                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                      >
                                        <svg
                                          className="w-4 h-4 mr-2"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                                          />
                                        </svg>
                                        Resend via Email
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleResendPhoneLink(
                                            evaluator.id,
                                            evaluator.phone
                                          );
                                          setShowDropdown(null);
                                        }}
                                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                        disabled={
                                          !evaluator.phone ||
                                          evaluator.phone === "Not provided"
                                        }
                                      >
                                        <svg
                                          className="w-4 h-4 mr-2"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                          />
                                        </svg>
                                        <span
                                          className={
                                            !evaluator.phone ||
                                            evaluator.phone === "Not provided"
                                              ? "text-gray-400"
                                              : ""
                                          }
                                        >
                                          Resend via Phone
                                        </span>
                                      </button>
                                      <div className="border-t border-gray-100 my-1"></div>
                                      <button
                                        onClick={() => {
                                          handleRemoveEvaluator(
                                            group.id,
                                            evaluator.id
                                          );
                                          setShowDropdown(null);
                                        }}
                                        className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                                      >
                                        <svg
                                          className="w-4 h-4 mr-2"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                          />
                                        </svg>
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Relationship and Status in one row */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                {evaluator.relationship && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {evaluator.relationship}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                {(() => {
                                  const apiEvaluator = apiEvaluators.find(
                                    (e) => e.id === evaluator.id
                                  );
                                  if (apiEvaluator) {
                                    if (apiEvaluator.isEvaluationCompleted) {
                                      return (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          Completed
                                        </span>
                                      );
                                    } else if (apiEvaluator.isEmailSent) {
                                      return (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                          Sent
                                        </span>
                                      );
                                    } else {
                                      return (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                          Not Sent
                                        </span>
                                      );
                                    }
                                  } else {
                                    // Fallback to old logic
                                    return evaluator.invitationSent ? (
                                      <span
                                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                          evaluator.responseReceived
                                            ? "bg-green-100 text-green-800"
                                            : "bg-yellow-100 text-yellow-800"
                                        }`}
                                      >
                                        {evaluator.responseReceived
                                          ? "Completed"
                                          : "Pending Response"}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                        Not Sent
                                      </span>
                                    );
                                  }
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium">
                    No evaluators added yet
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Click "Add {group.name}" to get started
                  </p>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Add/Edit Evaluator Dialog */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedEvaluator ? "Edit Evaluator" : "Add New Evaluator"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {errors.general && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{errors.general}</p>
                </div>
              )}

              {!selectedGroup && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Evaluator Group *
                  </label>
                  <Select
                    value={selectedGroup}
                    onValueChange={setSelectedGroup}
                  >
                    <SelectTrigger
                      className={errors.group ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="Select a group" />
                    </SelectTrigger>
                    <SelectContent>
                      {evaluatorGroups.map((group) => (
                        <SelectItem
                          key={group.id}
                          value={group.id}
                          disabled={group.evaluators.length >= group.maxAllowed}
                        >
                          {group.name} ({group.evaluators.length}/
                          {group.maxAllowed})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.group && (
                    <p className="text-red-500 text-sm mt-1">{errors.group}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={newEvaluator.name}
                  onChange={(e) =>
                    setNewEvaluator({ ...newEvaluator, name: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.name ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter evaluator's full name"
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newEvaluator.email}
                  onChange={(e) =>
                    setNewEvaluator({ ...newEvaluator, email: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.email ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter evaluator's email"
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number with Country Code
                </label>
                <input
                  type="tel"
                  value={newEvaluator.phone}
                  onChange={(e) =>
                    setNewEvaluator({ ...newEvaluator, phone: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.phone ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="e.g., +1234567890 (optional)"
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Optional: Include country code (e.g., +1 for US, +44 for UK)
                </p>
              </div>

              {selectedGroup &&
                requiresRelationship(
                  evaluatorGroups.find((g) => g.id === selectedGroup)?.type ||
                    ""
                ) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Relationship *
                    </label>
                    <Select
                      value={newEvaluator.relationship}
                      onValueChange={(value) =>
                        setNewEvaluator({
                          ...newEvaluator,
                          relationship: value,
                        })
                      }
                    >
                      <SelectTrigger
                        className={errors.relationship ? "border-red-500" : ""}
                      >
                        <SelectValue placeholder="Select relationship" />
                      </SelectTrigger>
                      <SelectContent>
                        {getRelationshipOptions(
                          evaluatorGroups.find((g) => g.id === selectedGroup)
                            ?.type || ""
                        ).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.relationship && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.relationship}
                      </p>
                    )}
                  </div>
                )}
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setErrors({});
                  setNewEvaluator({
                    name: "",
                    email: "",
                    phone: "",
                    relationship: "",
                  });
                  setSelectedGroup("");
                  setSelectedEvaluator(null); // Reset selected evaluator
                }}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all duration-200 hover:shadow-md"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEvaluator}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {selectedEvaluator ? "Updating..." : "Adding..."}
                  </>
                ) : selectedEvaluator ? (
                  "Update Evaluator"
                ) : (
                  "Add Evaluator"
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Email Selector Dialog */}
        <Dialog open={showEmailSelector} onOpenChange={setShowEmailSelector}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Evaluators for Email</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Choose which evaluators to send email invitations to:
              </p>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {apiEvaluators.map((group) => (
                  <div key={group.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`email-${group.id}`}
                      checked={selectedEvaluatorsForEmail.includes(group.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEvaluatorsForEmail((prev) => [
                            ...prev,
                            group.id,
                          ]);
                        } else {
                          setSelectedEvaluatorsForEmail((prev) =>
                            prev.filter((id) => id !== group.id)
                          );
                        }
                      }}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label
                      htmlFor={`email-${group.id}`}
                      className="text-sm font-medium leading-none"
                    >
                      {group.evaluatorName} ({group.relation})
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowEmailSelector(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowEmailSelector(false);
                    handleSendEmailInvitations();
                  }}
                  disabled={selectedEvaluatorsForEmail.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Send Emails ({selectedEvaluatorsForEmail.length})
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* SMS Selector Dialog */}
        <Dialog open={showSMSSelector} onOpenChange={setShowSMSSelector}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Evaluators for SMS</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Choose which evaluators to send SMS invitations to:
              </p>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {apiEvaluators.map((group) => (
                  <div key={group.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`sms-${group.id}`}
                      checked={selectedEvaluatorsForSMS.includes(group.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEvaluatorsForSMS((prev) => [
                            ...prev,
                            group.id,
                          ]);
                        } else {
                          setSelectedEvaluatorsForSMS((prev) =>
                            prev.filter((id) => id !== group.id)
                          );
                        }
                      }}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                    />
                    <label
                      htmlFor={`sms-${group.id}`}
                      className="text-sm font-medium leading-none"
                    >
                      {group.evaluatorName} ({group.relation})
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowSMSSelector(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowSMSSelector(false);
                    handleSendSMSInvitations();
                  }}
                  disabled={selectedEvaluatorsForSMS.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  Send SMS ({selectedEvaluatorsForSMS.length})
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
