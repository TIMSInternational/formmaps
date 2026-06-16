"use client";

import { motion } from "motion/react";
import {
  EvaluatorGroup,
  Evaluator,
  EvaluationGroupWithId,
} from "@/services/evaluationService";
import {
  Plus,
  Mail,
  Phone,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";

interface EvaluatorGroupCardProps {
  group: EvaluatorGroup;
  index: number;
  apiEvaluators: EvaluationGroupWithId[];
  showDropdown: string | null;
  onToggleDropdown: (evaluatorId: string) => void;
  onOpenAddModal: (groupId: string) => void;
  onEditEvaluator: (evaluator: Evaluator) => void;
  onRemoveEvaluator: (groupId: string, evaluatorId: string) => void;
  onResendEmailLink: (evaluatorId: string) => void;
  onResendPhoneLink: (evaluatorId: string, phone: string) => void;
  userEmail?: string;
}

export function EvaluatorGroupCard({
  group,
  index,
  apiEvaluators,
  showDropdown,
  onToggleDropdown,
  onOpenAddModal,
  onEditEvaluator,
  onRemoveEvaluator,
  onResendEmailLink,
  onResendPhoneLink,
  userEmail,
}: EvaluatorGroupCardProps) {
  const visibleEvaluators = group.evaluators.filter(
    (evaluator) => evaluator.relationship !== "Self"
  );

  return (
    <motion.div
      key={group.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.05 }}
      className="dash-card p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {group.name}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {group.evaluators.length}/{group.maxAllowed} added
            {group.minRequired > 0 && ` · min ${group.minRequired}`}
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

      <div className="mb-3">
        <button
          onClick={() => onOpenAddModal(group.id)}
          className="w-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          disabled={group.evaluators.length >= group.maxAllowed}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add {group.name}</span>
        </button>
      </div>

      {visibleEvaluators.length > 0 ? (
        <div className="space-y-3">
          {visibleEvaluators.map((evaluator) => (
            <EvaluatorCard
              key={evaluator.id}
              evaluator={evaluator}
              groupId={group.id}
              apiEvaluators={apiEvaluators}
              showDropdown={showDropdown}
              onToggleDropdown={onToggleDropdown}
              onEdit={onEditEvaluator}
              onRemove={onRemoveEvaluator}
              onResendEmail={onResendEmailLink}
              onResendPhone={onResendPhoneLink}
              userEmail={userEmail}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <UserPlus className="w-5 h-5 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">No evaluators yet</p>
        </div>
      )}
    </motion.div>
  );
}

interface EvaluatorCardProps {
  evaluator: Evaluator;
  groupId: string;
  apiEvaluators: EvaluationGroupWithId[];
  showDropdown: string | null;
  onToggleDropdown: (evaluatorId: string) => void;
  onEdit: (evaluator: Evaluator) => void;
  onRemove: (groupId: string, evaluatorId: string) => void;
  onResendEmail: (evaluatorId: string) => void;
  onResendPhone: (evaluatorId: string, phone: string) => void;
  userEmail?: string;
}

function EvaluatorCard({
  evaluator,
  groupId,
  apiEvaluators,
  showDropdown,
  onToggleDropdown,
  onEdit,
  onRemove,
  onResendEmail,
  onResendPhone,
  userEmail,
}: EvaluatorCardProps) {
  const apiEvaluator = apiEvaluators.find((e) => e.id === evaluator.id);

  const renderStatus = () => {
    if (apiEvaluator) {
      if (apiEvaluator.isEvaluationCompleted) {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
            Completed
          </span>
        );
      } else if (apiEvaluator.isEmailSent) {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#065292]/10 text-[#065292]">
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
    }

    if (evaluator.invitationSent) {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
            evaluator.responseReceived
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {evaluator.responseReceived ? "Completed" : "Pending Response"}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-muted-foreground border border-border">
        Not Sent
      </span>
    );
  };

  return (
    <div className="relative p-3.5 rounded-xl bg-secondary border border-border">
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
                  (userEmail && evaluator.relationship === "Self"
                    ? userEmail
                    : "No email provided")}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3 flex-shrink-0" />
                {evaluator.phone}
              </p>
            </div>
            <div className="relative dropdown-container ml-2">
              <button
                onClick={() => onToggleDropdown(evaluator.id)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-card transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showDropdown === evaluator.id && (
                <div className="absolute right-0 mt-1 w-48 bg-card rounded-xl border border-border z-50">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        onEdit(evaluator);
                        onToggleDropdown(evaluator.id);
                      }}
                      className="flex items-center px-3 py-2 text-sm text-foreground hover:bg-secondary w-full text-left gap-2"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        onResendEmail(evaluator.id);
                        onToggleDropdown(evaluator.id);
                      }}
                      className="flex items-center px-3 py-2 text-sm text-foreground hover:bg-secondary w-full text-left gap-2"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Resend via Email
                    </button>
                    <button
                      onClick={() => {
                        onResendPhone(evaluator.id, evaluator.phone);
                        onToggleDropdown(evaluator.id);
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
                        onRemove(groupId, evaluator.id);
                        onToggleDropdown(evaluator.id);
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
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#065292]/10 text-[#065292]">
                  {evaluator.relationship}
                </span>
              )}
            </div>
            <div className="flex items-center">{renderStatus()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
