"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EvaluatorGroupCard } from "./_components/EvaluatorGroupCard";
import { AddEvaluatorDialog } from "./_components/AddEvaluatorDialog";
import { InvitationSelectorDialog } from "./_components/InvitationSelectorDialog";
import { InvitationActions } from "./_components/InvitationActions";
import { useEvaluatorManagement } from "./_components/useEvaluatorManagement";

export default function EvaluatorsPage() {
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
    user,
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
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          360° Evaluation
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Add evaluators from different groups to get comprehensive feedback.
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
