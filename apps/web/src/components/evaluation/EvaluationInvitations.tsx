"use client";

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  EnvelopeIcon,
  LinkIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import { useEvaluationData } from "@/hooks/useEvaluationData";
import {
  EvaluationSession,
  Evaluator,
  resendInvitationLink,
  sendBulkEmailInvitations,
} from "@/services/evaluationService";
import i18n from "@/lib/i18n";

interface EvaluationInvitationsProps {
  sessionId: string;
  onBack?: () => void;
}

interface InvitationStatus {
  evaluatorId: string;
  status: "pending" | "sent" | "opened" | "completed" | "expired";
  sentAt?: Date;
  openedAt?: Date;
  completedAt?: Date;
  reminderCount: number;
  lastReminderAt?: Date;
}

interface InvitationTemplate {
  subject: string;
  message: string;
  includeInstructions: boolean;
  reminderEnabled: boolean;
  reminderDays: number;
}

const defaultTemplates: Record<string, InvitationTemplate> = {
  parent: {
    subject: "360° Evaluation Request - Your Input Needed",
    message: `Dear Parent,\n\nYou have been invited to participate in a 360-degree evaluation for your child. Your honest feedback will help provide valuable insights for their personal and academic development.\n\nThis evaluation is confidential and will take approximately 10-15 minutes to complete.\n\nThank you for your participation.`,
    includeInstructions: true,
    reminderEnabled: true,
    reminderDays: 3,
  },
  teacher: {
    subject: "360° Evaluation Request - Student Assessment",
    message: `Dear Educator,\n\nYou have been invited to participate in a 360-degree evaluation for one of your students. Your professional perspective is valuable for their development assessment.\n\nThis evaluation is confidential and will take approximately 10-15 minutes to complete.\n\nThank you for your time and input.`,
    includeInstructions: true,
    reminderEnabled: true,
    reminderDays: 5,
  },
  peer: {
    subject: "360° Evaluation Request - Peer Assessment",
    message: `Hi there,\n\nYou have been invited to participate in a 360-degree evaluation for a friend/peer. Your honest feedback will help provide insights for their personal development.\n\nThis evaluation is confidential and will take approximately 10-15 minutes to complete.\n\nThanks for helping out!`,
    includeInstructions: true,
    reminderEnabled: true,
    reminderDays: 3,
  },
  self: {
    subject: "360° Self-Evaluation - Complete Your Assessment",
    message: `Hello,\n\nPlease complete your self-evaluation as part of your 360-degree assessment. This is an important opportunity for self-reflection and personal development.\n\nThe evaluation will take approximately 15-20 minutes to complete.\n\nThank you.`,
    includeInstructions: true,
    reminderEnabled: true,
    reminderDays: 2,
  },
};

const EvaluationInvitations: React.FC<EvaluationInvitationsProps> = ({
  sessionId,
  onBack,
}) => {
  const { t } = useTranslation();
  const { loadSession, sendInvitations } = useEvaluationData();
  const [session, setSession] = useState<EvaluationSession | null>(null);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [invitationStatuses, setInvitationStatuses] = useState<
    InvitationStatus[]
  >([]);
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [customTemplate, setCustomTemplate] = useState<InvitationTemplate>(
    defaultTemplates.parent,
  );
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [emailResults, setEmailResults] = useState<{
    successful: number;
    failed: number;
    details: Array<{
      evaluatorId: string;
      evaluatorName: string;
      email: string;
      status: "sent" | "failed";
      error?: string;
    }>;
  } | null>(null);
  const [resendingEmails, setResendingEmails] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    loadInvitationData();
  }, [sessionId]);
  console.log(evaluators);
  const loadInvitationData = async () => {
    try {
      setLoading(true);
      const sessionData = await loadSession(sessionId);

      if (sessionData) {
        setSession(sessionData);
        setEvaluators(sessionData.evaluators);

        // Mock invitation statuses for development
        const statuses = sessionData.evaluators.map((evaluator) => ({
          evaluatorId: evaluator.id,
          status: evaluator.invitationSent
            ? evaluator.responseReceived
              ? ("completed" as const)
              : ("sent" as const)
            : ("pending" as const),
          reminderCount: 0,
          sentAt: evaluator.invitationSentAt
            ? new Date(evaluator.invitationSentAt)
            : undefined,
          completedAt: evaluator.responseReceivedAt
            ? new Date(evaluator.responseReceivedAt)
            : undefined,
        }));
        setInvitationStatuses(statuses);
      }
    } catch (error) {
      console.error("Error loading invitation data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateInvitationLink = (evaluator: Evaluator): string => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const token = btoa(`${evaluator.id}-${sessionId}-${Date.now()}`);
    return `${baseUrl}/evaluation/respond?token=${token}`;
  };

  const getFilteredEvaluators = () => {
    if (selectedGroup === "all") return evaluators;
    return evaluators.filter(
      (evaluator) => evaluator.groupType === selectedGroup,
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
      case "sent":
        return <PaperAirplaneIcon className="w-5 h-5 text-blue-500" />;
      case "opened":
        return <EnvelopeIcon className="w-5 h-5 text-yellow-500" />;
      case "completed":
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case "expired":
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending":
        return i18n.t("evaluation.status.notSent");
      case "sent":
        return i18n.t("evaluation.status.sent");
      case "opened":
        return i18n.t("evaluation.status.opened");
      case "completed":
        return i18n.t("evaluation.status.completed");
      case "expired":
        return i18n.t("evaluation.status.expired");
      default:
        return i18n.t("evaluation.status.unknown");
    }
  };

  const handleSendInvitations = async () => {
    if (selectedEvaluators.length === 0) return;

    try {
      setSending(true);

      for (const evaluatorId of selectedEvaluators) {
        const evaluator = evaluators.find((e) => e.id === evaluatorId);
        if (evaluator) {
          console.log(evaluator);
          try {
            // Use resend email invitation for individual evaluators
            await resendInvitationLink(evaluator.groupId || evaluator.id);

            // Update status on success
            setInvitationStatuses((prev) =>
              prev.map((status) =>
                status.evaluatorId === evaluatorId
                  ? { ...status, status: "sent" as const, sentAt: new Date() }
                  : status,
              ),
            );
          } catch (error) {
            console.error(
              `Failed to send invitation to ${evaluator.name}:`,
              error,
            );
          }
        }
      }

      setSelectedEvaluators([]);
    } catch (error) {
      console.error("Error sending invitations:", error);
    } finally {
      setSending(false);
    }
  };

  const handleSendBulkInvitations = async () => {
    if (!session?.evaluatedPersonId) return;

    try {
      setSendingBulk(true);

      const result = await sendBulkEmailInvitations(session.evaluatedPersonId);

      if (result.success && result.results) {
        // Transform the API response to match the expected state structure
        const successful = result.results.filter(
          (r: any) => r.status === "sent",
        ).length;
        const failed = result.results.filter(
          (r: any) => r.status === "failed",
        ).length;

        const transformedResults = {
          successful,
          failed,
          details: result.results.map((r: any) => ({
            evaluatorId: r.evaluatorId || r.id,
            evaluatorName: r.evaluatorName || r.name,
            email: r.email,
            status: r.status,
            error: r.error,
          })),
        };

        setEmailResults(transformedResults);

        // Update invitation statuses for successful sends
        setInvitationStatuses((prev) =>
          prev.map((status) => {
            const detail = transformedResults.details.find(
              (d) => d.evaluatorId === status.evaluatorId,
            );
            if (detail && detail.status === "sent") {
              return { ...status, status: "sent" as const, sentAt: new Date() };
            }
            return status;
          }),
        );
      } else {
        console.error("Failed to send bulk invitations:", result.message);
      }
    } catch (error) {
      console.error("Error sending bulk invitations:", error);
    } finally {
      setSendingBulk(false);
    }
  };

  const handleResendEmail = async (invitationToken: string) => {
    try {
      setResendingEmails((prev) => new Set(prev).add(invitationToken));
      console.log(invitationToken);

      // Find evaluator by invitationToken to get the groupId
      const evaluator = evaluators.find(
        (e) => e.invitationToken === invitationToken,
      );

      if (!evaluator) {
        console.error("Evaluator not found for token:", invitationToken);
        return;
      }

      await resendInvitationLink(evaluator.groupId || evaluator.id);

      // Update status on success
      setInvitationStatuses((prev) =>
        prev.map((status) =>
          status.evaluatorId === evaluator.id
            ? { ...status, status: "sent" as const, sentAt: new Date() }
            : status,
        ),
      );

      // Show success message or update UI as needed
      console.log("Email resent successfully");
    } catch (error) {
      console.error("Error resending email:", error);
    } finally {
      setResendingEmails((prev) => {
        const newSet = new Set(prev);
        newSet.delete(invitationToken);
        return newSet;
      });
    }
  };

  const handleSendReminders = async () => {
    const eligibleEvaluators = selectedEvaluators.filter((id) => {
      const status = invitationStatuses.find((s) => s.evaluatorId === id);
      return status && ["sent", "opened"].includes(status.status);
    });

    if (eligibleEvaluators.length === 0) return;

    try {
      setSending(true);

      for (const evaluatorId of eligibleEvaluators) {
        const evaluator = evaluators.find((e) => e.id === evaluatorId);
        if (evaluator) {
          const template =
            defaultTemplates[evaluator.groupType] || customTemplate;
          const invitationLink = generateInvitationLink(evaluator);

          await sendInvitations(sessionId, [evaluator.id]);

          // Update reminder count
          setInvitationStatuses((prev) =>
            prev.map((status) =>
              status.evaluatorId === evaluatorId
                ? {
                    ...status,
                    reminderCount: status.reminderCount + 1,
                    lastReminderAt: new Date(),
                  }
                : status,
            ),
          );
        }
      }

      setSelectedEvaluators([]);
    } catch (error) {
      console.error("Error sending reminders:", error);
    } finally {
      setSending(false);
    }
  };

  const copyInvitationLink = async (evaluator: Evaluator) => {
    const link = generateInvitationLink(evaluator);
    try {
      await navigator.clipboard.writeText(link);
      // You could add a toast notification here
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  const toggleEvaluatorSelection = (evaluatorId: string) => {
    setSelectedEvaluators((prev) =>
      prev.includes(evaluatorId)
        ? prev.filter((id) => id !== evaluatorId)
        : [...prev, evaluatorId],
    );
  };

  const selectAllFiltered = () => {
    const filteredIds = getFilteredEvaluators().map((e) => e.id);
    setSelectedEvaluators(filteredIds);
  };

  const clearSelection = () => {
    setSelectedEvaluators([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Session not found</p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  const filteredEvaluators = getFilteredEvaluators();
  const completedCount = invitationStatuses.filter(
    (s) => s.status === "completed",
  ).length;
  const sentCount = invitationStatuses.filter((s) =>
    ["sent", "opened", "completed"].includes(s.status),
  ).length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Evaluation Invitations
          </h1>
          <p className="text-gray-600 mt-2">
            Manage invitations for {session.evaluatedPersonName}'s 360°
            evaluation
          </p>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            ← Back
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-sm font-medium text-gray-500">
            {t("evaluation.totalEvaluators")}
          </h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {evaluators.length}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-sm font-medium text-gray-500">
            {t("evaluation.invitationsSent")}
          </h3>
          <p className="text-3xl font-bold text-green-600 mt-2">{sentCount}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-sm font-medium text-gray-500">
            {t("evaluation.completed")}
          </h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">
            {completedCount}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-sm font-medium text-gray-500">Response Rate</h3>
          <p className="text-3xl font-bold text-orange-600 mt-2">
            {evaluators.length > 0
              ? Math.round((completedCount / evaluators.length) * 100)
              : 0}
            %
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            {/* Group Filter */}
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">{t("evaluation.groups.all")}</option>
              <option value="self">{t("evaluation.groups.self")}</option>
              <option value="parent">{t("evaluation.groups.parents")}</option>
              <option value="teacher">{t("evaluation.groups.teachers")}</option>
              <option value="peer">{t("evaluation.groups.peers")}</option>
            </select>

            {/* Selection Controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={selectAllFiltered}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t("common.selectAll")}
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t("common.clear")}
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-600">
              {selectedEvaluators.length} selected
            </span>

            <button
              onClick={() => setShowTemplateEditor(!showTemplateEditor)}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Edit Template
            </button>

            <button
              onClick={handleSendReminders}
              disabled={sending || selectedEvaluators.length === 0}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? t("common.sending") : t("evaluation.sendReminders")}
            </button>

            <button
              onClick={handleSendBulkInvitations}
              disabled={sendingBulk}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              <EnvelopeIcon className="w-4 h-4" />
              <span>
                {sendingBulk
                  ? t("common.sending")
                  : t("evaluation.sendAllByEmail")}
              </span>
            </button>

            <button
              onClick={handleSendInvitations}
              disabled={sending || selectedEvaluators.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
              <span>
                {sending ? t("common.sending") : t("evaluation.sendSelected")}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Template Editor */}
      {showTemplateEditor && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-white p-6 rounded-lg shadow-sm border mb-8"
        >
          <h3 className="text-lg font-semibold mb-4">
            {t("evaluation.emailTemplate")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("evaluation.template.subject")}
              </label>
              <input
                type="text"
                value={customTemplate.subject}
                onChange={(e) =>
                  setCustomTemplate((prev) => ({
                    ...prev,
                    subject: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("evaluation.template.reminderDays")}
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={customTemplate.reminderDays}
                onChange={(e) =>
                  setCustomTemplate((prev) => ({
                    ...prev,
                    reminderDays: parseInt(e.target.value),
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={customTemplate.message}
              onChange={(e) =>
                setCustomTemplate((prev) => ({
                  ...prev,
                  message: e.target.value,
                }))
              }
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="mt-4 flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={customTemplate.includeInstructions}
                onChange={(e) =>
                  setCustomTemplate((prev) => ({
                    ...prev,
                    includeInstructions: e.target.checked,
                  }))
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                {t("evaluation.template.includeInstructions")}
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={customTemplate.reminderEnabled}
                onChange={(e) =>
                  setCustomTemplate((prev) => ({
                    ...prev,
                    reminderEnabled: e.target.checked,
                  }))
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                {t("evaluation.template.enableReminders")}
              </span>
            </label>
          </div>
        </motion.div>
      )}

      {/* Evaluators Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">
            {t("evaluation.evaluators", { count: filteredEvaluators.length })}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedEvaluators.length === filteredEvaluators.length &&
                      filteredEvaluators.length > 0
                    }
                    onChange={() => {
                      if (
                        selectedEvaluators.length === filteredEvaluators.length
                      ) {
                        clearSelection();
                      } else {
                        selectAllFiltered();
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Group
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reminders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEvaluators.map((evaluator) => {
                const status = invitationStatuses.find(
                  (s) => s.evaluatorId === evaluator.id,
                );
                return (
                  <tr key={evaluator.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedEvaluators.includes(evaluator.id)}
                        onChange={() => toggleEvaluatorSelection(evaluator.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {evaluator.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          evaluator.groupType === "parent" &&
                          evaluator.relationship === "Self"
                            ? "bg-purple-100 text-purple-800"
                            : evaluator.groupType === "parent"
                              ? "bg-green-100 text-green-800"
                              : evaluator.groupType === "teacher"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {evaluator.groupType === "parent" &&
                        evaluator.relationship === "Self"
                          ? "Self"
                          : evaluator.groupType.charAt(0).toUpperCase() +
                            evaluator.groupType.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {evaluator.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(status?.status || "pending")}
                        <span>
                          {getStatusText(status?.status || "pending")}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {status?.reminderCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-2">
                        {status?.status === "sent" && (
                          <button
                            onClick={() =>
                              handleResendEmail(evaluator.invitationToken)
                            }
                            disabled={resendingEmails.has(
                              evaluator.invitationToken,
                            )}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title={
                              resendingEmails.has(evaluator.invitationToken)
                                ? "Resending..."
                                : "Resend email invitation"
                            }
                          >
                            <EnvelopeIcon
                              className={`w-4 h-4 ${
                                resendingEmails.has(evaluator.invitationToken)
                                  ? "animate-pulse"
                                  : ""
                              }`}
                            />
                          </button>
                        )}
                        <button
                          onClick={() => copyInvitationLink(evaluator)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Copy invitation link"
                        >
                          <DocumentDuplicateIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Email Results Display */}
      {emailResults && (
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Email Invitation Results
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-green-100 rounded-lg p-3">
              <div className="text-green-800 font-semibold">Successful</div>
              <div className="text-2xl font-bold text-green-900">
                {emailResults.successful}
              </div>
            </div>
            <div className="bg-red-100 rounded-lg p-3">
              <div className="text-red-800 font-semibold">Failed</div>
              <div className="text-2xl font-bold text-red-900">
                {emailResults.failed}
              </div>
            </div>
          </div>

          {emailResults.details.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Details:</h4>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {emailResults.details.map((detail, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      detail.status === "sent"
                        ? "bg-green-50 text-green-800"
                        : "bg-red-50 text-red-800"
                    }`}
                  >
                    <span>
                      {detail.evaluatorName} ({detail.email})
                    </span>
                    <span className="font-medium">
                      {detail.status === "sent" ? "✓ Sent" : "✗ Failed"}
                      {detail.error && `: ${detail.error}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setEmailResults(null)}
            className="mt-4 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            {t("evaluation.closeResults")}
          </button>
        </div>
      )}
    </div>
  );
};

export default EvaluationInvitations;
