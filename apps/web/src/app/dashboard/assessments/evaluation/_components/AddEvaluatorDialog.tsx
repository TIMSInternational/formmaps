"use client";

import { EvaluatorGroup } from "@/services/evaluationService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export interface NewEvaluatorForm {
  name: string;
  email: string;
  phone: string;
  relationship: string;
}

interface AddEvaluatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEvaluator: string | null;
  selectedGroup: string;
  onSelectedGroupChange: (group: string) => void;
  newEvaluator: NewEvaluatorForm;
  onNewEvaluatorChange: (evaluator: NewEvaluatorForm) => void;
  errors: Record<string, string>;
  evaluatorGroups: EvaluatorGroup[];
  loading: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

function getRelationshipOptions(groupType: string): string[] {
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
}

function requiresRelationship(groupType: string): boolean {
  return groupType !== "teacher";
}

export function AddEvaluatorDialog({
  open,
  onOpenChange,
  selectedEvaluator,
  selectedGroup,
  onSelectedGroupChange,
  newEvaluator,
  onNewEvaluatorChange,
  errors,
  evaluatorGroups,
  loading,
  onSubmit,
  onCancel,
}: AddEvaluatorDialogProps) {
  const currentGroupType =
    evaluatorGroups.find((g) => g.id === selectedGroup)?.type || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                onValueChange={onSelectedGroupChange}
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
                onNewEvaluatorChange({ ...newEvaluator, name: e.target.value })
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
                onNewEvaluatorChange({ ...newEvaluator, email: e.target.value })
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
                onNewEvaluatorChange({ ...newEvaluator, phone: e.target.value })
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

          {selectedGroup && requiresRelationship(currentGroupType) && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Relationship *
              </label>
              <Select
                value={newEvaluator.relationship}
                onValueChange={(value) =>
                  onNewEvaluatorChange({
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
                  {getRelationshipOptions(currentGroupType).map((option) => (
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
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-border text-foreground rounded-xl hover:bg-secondary font-medium text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
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
  );
}
