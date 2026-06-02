"use client";

import { useTranslation } from "react-i18next";
import { Plus, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { typeConfig } from "./portfolioConfig";
import type { PortfolioItemPayload, PortfolioItemType, PortfolioItem } from "@/types/portfolio";

interface PortfolioFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: PortfolioItem | null;
  formData: PortfolioItemPayload;
  onFormDataChange: (data: PortfolioItemPayload) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function PortfolioFormDialog({
  open,
  onOpenChange,
  editingItem,
  formData,
  onFormDataChange,
  onSubmit,
  isPending,
}: PortfolioFormDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-card border-border rounded-xl">
        <div className="p-5 border-b border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              {editingItem ? (
                <>
                  <Edit className="w-4 h-4 text-muted-foreground" />
                  {t("portfolio.editItem", "Edit Experience")}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-muted-foreground" />
                  {t("portfolio.addItem", "Add New Experience")}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type of Experience</label>
            <Select
              value={formData.type}
              onValueChange={(v) =>
                onFormDataChange({ ...formData, type: v as PortfolioItemType })
              }
            >
              <SelectTrigger className="h-10 bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(typeConfig) as PortfolioItemType[]).map(
                  (type) => (
                    <SelectItem key={type} value={type} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        {typeConfig[type].label}
                      </div>
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title *</label>
            <Input
              placeholder="E.g., Varsity Team Captain, Software Engineer Intern..."
              className="h-10 bg-secondary border-border"
              value={formData.title}
              onChange={(e) =>
                onFormDataChange({ ...formData, title: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization / School</label>
              <Input
                placeholder="Where did this happen?"
                className="h-10 bg-secondary border-border"
                value={formData.organization}
                onChange={(e) =>
                  onFormDataChange({ ...formData, organization: e.target.value })
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role / Position</label>
              <Input
                placeholder="What was your title?"
                className="h-10 bg-secondary border-border"
                value={formData.role}
                onChange={(e) =>
                  onFormDataChange({ ...formData, role: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
            <Textarea
              placeholder="Describe your responsibilities and what you learned..."
              className="resize-none bg-secondary border-border min-h-[80px]"
              value={formData.description}
              onChange={(e) =>
                onFormDataChange({ ...formData, description: e.target.value })
              }
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("portfolio.startDate", "Start Date")}
              </label>
              <Input
                type="date"
                className="h-10 bg-secondary border-border"
                value={formData.startDate}
                onChange={(e) =>
                  onFormDataChange({ ...formData, startDate: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("portfolio.endDate", "End Date")}
              </label>
              <Input
                type="date"
                className="h-10 bg-secondary border-border"
                value={formData.endDate || ""}
                onChange={(e) =>
                  onFormDataChange({
                    ...formData,
                    endDate: e.target.value || undefined,
                  })
                }
              />
            </div>
            <div className="space-y-1 col-span-2 md:col-span-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("portfolio.totalHours", "Total Hours")}
              </label>
              <Input
                type="number"
                placeholder="0"
                className="h-10 bg-secondary border-border"
                value={formData.totalHours || ""}
                onChange={(e) =>
                  onFormDataChange({
                    ...formData,
                    totalHours: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="p-5 bg-secondary border-t border-border flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            className="bg-foreground text-background hover:bg-foreground/90 px-6"
            onClick={onSubmit}
            disabled={!formData.title.trim() || isPending}
          >
            {editingItem
              ? t("common.save", "Save Changes")
              : t("portfolio.create", "Create Experience")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
