"use client";

import { useState } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { EvaluatorGroupCard } from "./_components/EvaluatorGroupCard";
import { AddEvaluatorDialog } from "./_components/AddEvaluatorDialog";
import { InvitationSelectorDialog } from "./_components/InvitationSelectorDialog";
import { InvitationActions } from "./_components/InvitationActions";
import { useEvaluatorManagement } from "./_components/useEvaluatorManagement";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useEvaluationGroups } from "@/hooks/useAssessmentQueries";
import { getSelfEvaluationUrl } from "@/services/evaluationService";
import { toast } from "sonner";

export default function EvaluatorsPage() {
  const { user, language } = useGlobalStore();
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  // Check self-evaluation status
  const { data: evalGroups, isLoading: loadingGroups } = useEvaluationGroups(user?.id || "");
  const selfGroup = evalGroups?.find(
    (g) => g.relation === "Self" || (g.groupType === "Parent" && g.relation === "Self")
  );
  const selfCompleted = selfGroup?.isEvaluationCompleted === true;

  const handleStartSelfEval = async () => {
    try {
      setStarting(true);
      const selfEval = await getSelfEvaluationUrl(
        user?.id || "",
        user?.name || "Self",
        user?.email || "",
        language
      );
      if (selfEval) {
        router.push(selfEval.url);
      } else {
        toast.error("Failed to start self-evaluation.");
      }
    } catch {
      toast.error("Failed to start evaluation.");
    } finally {
      setStarting(false);
    }
  };

  const {
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
    setEmailSendMode,
    setSmsSendMode,
    selectedEvaluatorsForEmail,
    setSelectedEvaluatorsForEmail,
    selectedEvaluatorsForSMS,
    setSelectedEvaluatorsForSMS,
    showEmailSelector,
    setShowEmailSelector,
    showSMSSelector,
    setShowSMSSelector,
    getTotalEvaluators,
    areAllGroupsComplete,
    openAddModal,
    handleAddEvaluator,
    handleRemoveEvaluator,
    handleEditEvaluator,
    handleResendEmailLink,
    handleResendPhoneLink,
    handleSendEmailInvitations,
    handleSendSMSInvitations,
    handleCancelModal,
  } = useEvaluatorManagement();

  // Self-evaluation gate
  if (!loadingGroups && !selfCompleted) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <Link
          href="/dashboard/assessments"
          className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Assessments
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border shadow-sm p-8 text-center"
        >
          <div className="w-16 h-16 bg-[#102B47]/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <ClipboardList className="w-8 h-8 text-[#2E9098]" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">
            Complete Your Self-Evaluation First
          </h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-sm mx-auto">
            Before inviting others to evaluate you, start by evaluating yourself. This helps establish a baseline for comparison.
          </p>

          <button
            onClick={handleStartSelfEval}
            disabled={starting}
            className="w-full bg-[#102B47] text-white py-3 px-6 rounded-lg hover:bg-[#0b1f33] transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {starting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
            ) : (
              <>Start Self-Evaluation <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6">
      <Link
        href="/dashboard/assessments"
        className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Assessments
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            360° Evaluation
          </h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-700">Self-Evaluation Done</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Now invite evaluators from different groups to get comprehensive feedback.
        </p>
      </motion.div>

      <div className="space-y-4">
        <InvitationActions
          totalEvaluators={getTotalEvaluators()}
          allGroupsComplete={areAllGroupsComplete()}
          groupCount={evaluatorGroups.length}
          onSendAllEmails={() => {
            setEmailSendMode("all");
            handleSendEmailInvitations();
          }}
          onSendSpecificEmails={() => {
            setEmailSendMode("specific");
            setShowEmailSelector(true);
          }}
          onSendAllSMS={() => {
            setSmsSendMode("all");
            handleSendSMSInvitations();
          }}
          onSendSpecificSMS={() => {
            setSmsSendMode("specific");
            setShowSMSSelector(true);
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {evaluatorGroups.map((group, index) => (
            <EvaluatorGroupCard
              key={group.id}
              group={group}
              index={index}
              apiEvaluators={apiEvaluators}
              showDropdown={showDropdown}
              onToggleDropdown={(id) =>
                setShowDropdown(showDropdown === id ? null : id)
              }
              onOpenAddModal={openAddModal}
              onEditEvaluator={handleEditEvaluator}
              onRemoveEvaluator={handleRemoveEvaluator}
              onResendEmailLink={handleResendEmailLink}
              onResendPhoneLink={handleResendPhoneLink}
              userEmail={user?.email ?? undefined}
            />
          ))}
        </div>

        <AddEvaluatorDialog
          open={showAddModal}
          onOpenChange={setShowAddModal}
          selectedEvaluator={selectedEvaluator}
          selectedGroup={selectedGroup}
          onSelectedGroupChange={setSelectedGroup}
          newEvaluator={newEvaluator}
          onNewEvaluatorChange={setNewEvaluator}
          errors={errors}
          evaluatorGroups={evaluatorGroups}
          loading={loading}
          onSubmit={handleAddEvaluator}
          onCancel={handleCancelModal}
        />

        <InvitationSelectorDialog
          open={showEmailSelector}
          onOpenChange={setShowEmailSelector}
          title="Select Evaluators for Email"
          description="Choose which evaluators to send email invitations to:"
          apiEvaluators={apiEvaluators}
          selectedIds={selectedEvaluatorsForEmail}
          onSelectedIdsChange={setSelectedEvaluatorsForEmail}
          onSend={handleSendEmailInvitations}
          sendLabel="Send Emails"
          checkboxColor="blue"
        />

        <InvitationSelectorDialog
          open={showSMSSelector}
          onOpenChange={setShowSMSSelector}
          title="Select Evaluators for SMS"
          description="Choose which evaluators to send SMS invitations to:"
          apiEvaluators={apiEvaluators}
          selectedIds={selectedEvaluatorsForSMS}
          onSelectedIdsChange={setSelectedEvaluatorsForSMS}
          onSend={handleSendSMSInvitations}
          sendLabel="Send SMS"
          checkboxColor="emerald"
        />
      </div>
    </div>
  );
}
