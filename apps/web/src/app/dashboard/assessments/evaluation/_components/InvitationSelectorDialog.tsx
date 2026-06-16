"use client";

import { EvaluationGroupWithId } from "@/services/evaluationService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InvitationSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  apiEvaluators: EvaluationGroupWithId[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  onSend: () => void;
  sendLabel: string;
  checkboxColor: "blue" | "emerald";
}

export function InvitationSelectorDialog({
  open,
  onOpenChange,
  title,
  description,
  apiEvaluators,
  selectedIds,
  onSelectedIdsChange,
  onSend,
  sendLabel,
  checkboxColor,
}: InvitationSelectorDialogProps) {
  const colorClasses =
    checkboxColor === "blue"
      ? "text-[#065292] focus:ring-[#065292]"
      : "text-emerald-600 focus:ring-emerald-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {apiEvaluators.map((group) => (
              <div key={group.id} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={`${checkboxColor}-${group.id}`}
                  checked={selectedIds.includes(group.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelectedIdsChange([...selectedIds, group.id]);
                    } else {
                      onSelectedIdsChange(
                        selectedIds.filter((id) => id !== group.id)
                      );
                    }
                  }}
                  className={`w-4 h-4 ${colorClasses} bg-card border-border rounded`}
                />
                <label
                  htmlFor={`${checkboxColor}-${group.id}`}
                  className="text-sm font-medium text-foreground leading-none"
                >
                  {group.evaluatorName} ({group.relation})
                </label>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm font-medium text-foreground border border-border rounded-xl hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onOpenChange(false);
                onSend();
              }}
              disabled={selectedIds.length === 0}
              className="px-4 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 rounded-xl disabled:opacity-50 transition-colors"
            >
              {sendLabel} ({selectedIds.length})
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
