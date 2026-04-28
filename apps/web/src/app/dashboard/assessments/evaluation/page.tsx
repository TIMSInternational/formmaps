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
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Plus,
  Mail,
  Phone,
  MoreVertical,
  Pencil,
  Trash2,
  Send,
  ChevronDown,
  Loader2,
  UserPlus,
} from "lucide-react";

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
    setNewEvaluator({
      name: evaluator.name,
      email: evaluator.email,
      phone: evaluator.phone,
      relationship: evaluator.relationship,
    });

    const group = evaluatorGroups.find((g) =>
      g.evaluators.some((e) => e.id === evaluator.id)
    );
    if (group) {
      setSelectedGroup(group.id);
    }

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

    try {
      toast.info(
        `SMS invitation would be sent to ${phoneNumber}. SMS functionality coming soon!`
      );
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
        result = await sendBulkEmailInvitations(user?.id || "");
      } else {
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
    <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh]">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <Link
          href="/dashboard/assessments"
          className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Assessments
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
          Invite Evaluators
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-[52ch]">
          Add evaluators from different groups to get comprehensive feedback
          for your 360-degree evaluation.
        </p>
      </motion.header>

      <div className="space-y-5 max-w-6xl">
        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="dash-card p-5"
        >
          <div className="flex items-center flex-col md:flex-row gap-4 justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                Evaluation Progress
              </h3>
              <p className="text-sm text-muted-foreground">
                {getTotalEvaluators()} evaluators added across{" "}
                {evaluatorGroups.length} groups
              </p>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={
                      getTotalEvaluators() === 0 || !areAllGroupsComplete()
                    }
                    className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Send Email Invitations</span>
                    <ChevronDown className="w-3.5 h-3.5" />
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
                    className="border border-border bg-card text-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Send SMS Invitations</span>
                    <ChevronDown className="w-3.5 h-3.5" />
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
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {evaluatorGroups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + index * 0.08 }}
              className="dash-card p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {group.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {group.evaluators.length} of {group.maxAllowed} evaluators
                    added
                    {group.minRequired > 0 &&
                      ` (min ${group.minRequired} required)`}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
                    group.evaluators.length >= group.minRequired
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {group.evaluators.length >= group.minRequired
                    ? "Complete"
                    : "Incomplete"}
                </span>
              </div>

              <div className="mb-4">
                <button
                  onClick={() => openAddModal(group.id)}
                  className="w-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  disabled={group.evaluators.length >= group.maxAllowed}
                >
                  <Plus className="w-4 h-4" />
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
                        className="relative p-3.5 rounded-xl bg-secondary border border-border"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-foreground text-sm mb-0.5 truncate">
                                  {evaluator.name}
                                </h4>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                  <Mail className="w-3 h-3 flex-shrink-0" />
                                  {evaluator.email ||
                                    (user?.email &&
                                    evaluator.relationship === "Self"
                                      ? user.email
                                      : "No email provided")}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 flex-shrink-0" />
                                  {evaluator.phone}
                                </p>
                              </div>
                              <div className="relative dropdown-container ml-2">
                                <button
                                  onClick={() => toggleDropdown(evaluator.id)}
                                  className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-card transition-colors"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>

                                {showDropdown === evaluator.id && (
                                  <div className="absolute right-0 mt-1 w-48 bg-card rounded-xl border border-border z-50">
                                    <div className="py-1">
                                      <button
                                        onClick={() => {
                                          handleEditEvaluator(evaluator);
                                          setShowDropdown(null);
                                        }}
                                        className="flex items-center px-3 py-2 text-sm text-foreground hover:bg-secondary w-full text-left gap-2"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleResendEmailLink(evaluator.id);
                                          setShowDropdown(null);
                                        }}
                                        className="flex items-center px-3 py-2 text-sm text-foreground hover:bg-secondary w-full text-left gap-2"
                                      >
                                        <Mail className="w-3.5 h-3.5" />
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
                                        className="flex items-center px-3 py-2 text-sm text-foreground hover:bg-secondary w-full text-left gap-2 disabled:opacity-50"
                                        disabled={
                                          !evaluator.phone ||
                                          evaluator.phone === "Not provided"
                                        }
                                      >
                                        <Phone className="w-3.5 h-3.5" />
                                        <span
                                          className={
                                            !evaluator.phone ||
                                            evaluator.phone === "Not provided"
                                              ? "opacity-50"
                                              : ""
                                          }
                                        >
                                          Resend via Phone
                                        </span>
                                      </button>
                                      <div className="border-t border-border my-1"></div>
                                      <button
                                        onClick={() => {
                                          handleRemoveEvaluator(
                                            group.id,
                                            evaluator.id
                                          );
                                          setShowDropdown(null);
                                        }}
                                        className="flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left gap-2"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Relationship and Status in one row */}
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center gap-2">
                                {evaluator.relationship && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
                                    {evaluator.relationship}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center">
                                {(() => {
                                  const apiEvaluator = apiEvaluators.find(
                                    (e) => e.id === evaluator.id
                                  );
                                  if (apiEvaluator) {
                                    if (apiEvaluator.isEvaluationCompleted) {
                                      return (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                                          Completed
                                        </span>
                                      );
                                    } else if (apiEvaluator.isEmailSent) {
                                      return (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
                                          Sent
                                        </span>
                                      );
                                    } else {
                                      return (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-muted-foreground border border-border">
                                          Not Sent
                                        </span>
                                      );
                                    }
                                  } else {
                                    return evaluator.invitationSent ? (
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                          evaluator.responseReceived
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-amber-100 text-amber-700"
                                        }`}
                                      >
                                        {evaluator.responseReceived
                                          ? "Completed"
                                          : "Pending Response"}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-muted-foreground border border-border">
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
                  <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mx-auto mb-3">
                    <UserPlus className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No evaluators added yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click &quot;Add {group.name}&quot; to get started
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
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-600 text-sm">{errors.general}</p>
                </div>
              )}

              {!selectedGroup && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
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
                <label className="block text-sm font-medium text-foreground mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={newEvaluator.name}
                  onChange={(e) =>
                    setNewEvaluator({ ...newEvaluator, name: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-xl bg-card text-foreground focus:ring-2 focus:ring-foreground/20 focus:border-foreground ${
                    errors.name ? "border-red-500" : "border-border"
                  }`}
                  placeholder="Enter evaluator's full name"
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newEvaluator.email}
                  onChange={(e) =>
                    setNewEvaluator({ ...newEvaluator, email: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-xl bg-card text-foreground focus:ring-2 focus:ring-foreground/20 focus:border-foreground ${
                    errors.email ? "border-red-500" : "border-border"
                  }`}
                  placeholder="Enter evaluator's email"
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Phone Number with Country Code
                </label>
                <input
                  type="tel"
                  value={newEvaluator.phone}
                  onChange={(e) =>
                    setNewEvaluator({ ...newEvaluator, phone: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-xl bg-card text-foreground focus:ring-2 focus:ring-foreground/20 focus:border-foreground ${
                    errors.phone ? "border-red-500" : "border-border"
                  }`}
                  placeholder="e.g., +1234567890 (optional)"
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Optional: Include country code (e.g., +1 for US, +44 for UK)
                </p>
              </div>

              {selectedGroup &&
                requiresRelationship(
                  evaluatorGroups.find((g) => g.id === selectedGroup)?.type ||
                    ""
                ) && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
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

            <div className="flex gap-3 mt-6">
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
                  setSelectedEvaluator(null);
                }}
                className="flex-1 px-4 py-2.5 border border-border text-foreground rounded-xl hover:bg-secondary font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEvaluator}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 rounded-xl font-medium text-sm transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
              <p className="text-sm text-muted-foreground">
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
                      className="w-4 h-4 text-blue-600 bg-card border-border rounded focus:ring-blue-500"
                    />
                    <label
                      htmlFor={`email-${group.id}`}
                      className="text-sm font-medium text-foreground leading-none"
                    >
                      {group.evaluatorName} ({group.relation})
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowEmailSelector(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground border border-border rounded-xl hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowEmailSelector(false);
                    handleSendEmailInvitations();
                  }}
                  disabled={selectedEvaluatorsForEmail.length === 0}
                  className="px-4 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 rounded-xl disabled:opacity-50 transition-colors"
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
              <p className="text-sm text-muted-foreground">
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
                      className="w-4 h-4 text-emerald-600 bg-card border-border rounded focus:ring-emerald-500"
                    />
                    <label
                      htmlFor={`sms-${group.id}`}
                      className="text-sm font-medium text-foreground leading-none"
                    >
                      {group.evaluatorName} ({group.relation})
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSMSSelector(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground border border-border rounded-xl hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowSMSSelector(false);
                    handleSendSMSInvitations();
                  }}
                  disabled={selectedEvaluatorsForSMS.length === 0}
                  className="px-4 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 rounded-xl disabled:opacity-50 transition-colors"
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
