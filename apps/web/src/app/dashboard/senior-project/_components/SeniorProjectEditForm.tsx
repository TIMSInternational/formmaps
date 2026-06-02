"use client";

import { motion } from "motion/react";
import { Pencil, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface SeniorProjectEditFormProps {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isMutating: boolean;
  hasExistingProject: boolean;
}

export function SeniorProjectEditForm({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  onSave,
  onCancel,
  isMutating,
  hasExistingProject,
}: SeniorProjectEditFormProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0, scale: 0.95 }}
      animate={{ opacity: 1, height: "auto", scale: 1 }}
      exit={{ opacity: 0, height: 0, scale: 0.95 }}
      className="overflow-hidden"
    >
      <div className="dash-card p-5 space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-secondary border border-border rounded-xl">
            <Pencil className="h-5 w-5 text-foreground" />
          </div>
          <h3 className="font-bold text-2xl text-foreground">
            {hasExistingProject ? "Edit Overview" : "Start Project Proposal"}
          </h3>
        </div>

        <div className="space-y-3">
          <Label className="text-muted-foreground font-bold text-sm uppercase tracking-wider">Project Title *</Label>
          <Input
            className="h-12 px-4 text-lg font-medium bg-secondary border-border rounded-xl"
            placeholder="e.g. Sustainable Water Filtration System"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <Label className="text-muted-foreground font-bold text-sm uppercase tracking-wider">Project Proposal / Description</Label>
          <Textarea
            className="min-h-[200px] p-4 text-base bg-secondary border-border rounded-xl resize-y"
            placeholder="Detail your research question, methodology, expected outcomes, and why this matters..."
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border">
          <Button variant="ghost" className="h-12 px-6 rounded-xl font-semibold hover:bg-secondary text-muted-foreground" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={isMutating || !title.trim()}
            onClick={onSave}
            className="h-12 px-8 bg-foreground text-background hover:bg-foreground/90 rounded-xl border-0 font-semibold"
          >
            {isMutating ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Save className="h-5 w-5 mr-2" />}
            {hasExistingProject ? "Save Changes" : "Create Project"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
