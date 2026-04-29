"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  GraduationCap,
  Pencil,
  Send,
  Paperclip,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  Target,
  FileUp,
  MessageSquareShare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useMySeniorProject,
  useCreateSeniorProject,
  useUpdateSeniorProject,
  useUploadSeniorProjectAttachment,
} from "@/hooks/useSeniorProjectQueries";
import type { SeniorProjectStatus } from "@/types/seniorProject";
import Link from "next/link";
import { format } from "date-fns";

const statusConfig: Record<
  SeniorProjectStatus,
  { icon: typeof CheckCircle2; label: string; color: string; bg: string; border: string; description: string; strip: string }
> = {
  not_started: {
    icon: Clock,
    label: "Not Started",
    color: "text-muted-foreground",
    bg: "bg-secondary",
    border: "border-border",
    strip: "bg-muted-foreground",
    description: "Create your senior project to get started.",
  },
  in_progress: {
    icon: Pencil,
    label: "In Progress",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    strip: "bg-blue-500",
    description: "You are working on your project. Submit when ready for review.",
  },
  submitted: {
    icon: Send,
    label: "Under Review",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    strip: "bg-amber-500",
    description: "Your project is being reviewed by your counselor.",
  },
  approved: {
    icon: CheckCircle2,
    label: "Approved",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    strip: "bg-emerald-500",
    description: "Congratulations! Your senior project has been approved.",
  },
  revision_needed: {
    icon: AlertTriangle,
    label: "Revision Needed",
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    strip: "bg-orange-500",
    description: "Your counselor has requested revisions. Check the feedback.",
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, type: "spring" as const, stiffness: 100, damping: 20 },
  }),
};

export default function SeniorProjectPage() {
  const { t } = useTranslation();
  const { data: project, isLoading } = useMySeniorProject();
  const createMutation = useCreateSeniorProject();
  const updateMutation = useUpdateSeniorProject();
  const uploadMutation = useUploadSeniorProjectAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const startEditing = () => {
    setTitle(project?.title ?? "");
    setDescription(project?.description ?? "");
    setIsEditing(true);
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    createMutation.mutate(
      { title: title.trim(), description: description.trim() },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const handleUpdate = () => {
    if (!title.trim()) return;
    updateMutation.mutate(
      { title: title.trim(), description: description.trim() },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const handleSubmitForReview = () => {
    updateMutation.mutate({ status: "submitted" });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

  const status = project?.status ?? "not_started";
  const sc = statusConfig[status];
  const StatusIcon = sc.icon;
  const canEdit = status === "not_started" || status === "in_progress" || status === "revision_needed";
  const canSubmit = (status === "in_progress" || status === "revision_needed") && !!project;
  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-8">

        {/* Header */}
        <div className="space-y-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
          >
            <div className="p-1.5 rounded-lg bg-secondary border border-border mr-2 group-hover:border-foreground/20 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </div>
            Back to Dashboard
          </Link>

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div className="space-y-3 max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Capstone Requirement
              </p>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                Senior Project
              </h1>
              <p className="text-muted-foreground text-base leading-relaxed">
                Plan, develop, and submit your final capstone project to fulfill your graduation requirements.
              </p>
            </div>
            <div className="shrink-0 flex gap-3">
              {!project && !isEditing && !isLoading && (
                <Button
                  size="lg"
                  onClick={() => setIsEditing(true)}
                  className="bg-foreground text-background hover:bg-foreground/90 rounded-xl border-0 h-12 px-6 font-semibold"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create Project
                </Button>
              )}
            </div>
          </motion.div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column: Status & Actions */}
            <div className="lg:w-1/3 space-y-6">
              <motion.div
                initial="hidden"
                animate="visible"
                custom={0}
                variants={cardVariants}
                className="dash-card p-5 relative overflow-hidden"
              >
                <div className={`absolute top-0 left-0 w-full h-1 ${sc.strip}`} />
                <div className={`p-3 rounded-xl w-fit mb-5 border ${sc.bg} ${sc.border}`}>
                  <StatusIcon className={`w-7 h-7 ${sc.color}`} />
                </div>
                <h3 className={`text-xl font-bold mb-2 ${sc.color}`}>{sc.label}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">{sc.description}</p>

                {project && canSubmit && (
                  <Button
                    size="lg"
                    disabled={updateMutation.isPending}
                    onClick={handleSubmitForReview}
                    className="w-full bg-foreground hover:bg-foreground/90 text-background rounded-xl border-0 h-12 font-semibold group"
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5 mr-2 group-hover:translate-x-1 transition-transform" />
                    )}
                    Submit for Review
                  </Button>
                )}

                {project && canEdit && !isEditing && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={startEditing}
                    className={`w-full h-12 rounded-xl border-border font-semibold hover:bg-secondary ${canSubmit ? 'mt-3' : ''}`}
                  >
                    <Pencil className="h-5 w-5 mr-2" />
                    Edit Details
                  </Button>
                )}

                {project?.submittedAt && status !== 'in_progress' && (
                  <div className="mt-6 pt-5 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Submitted On</p>
                    <p className="text-sm font-medium text-muted-foreground">{format(new Date(project.submittedAt), "MMMM d, yyyy")}</p>
                  </div>
                )}
              </motion.div>

              {/* Counselor Feedback */}
              {project?.counselorNote && (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  custom={1}
                  variants={cardVariants}
                  className="dash-card p-5 relative overflow-hidden"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-secondary rounded-xl border border-border">
                      <MessageSquareShare className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">Counselor Feedback</h4>
                      {project.reviewedAt && (
                        <p className="text-xs text-muted-foreground font-medium">Reviewed {format(new Date(project.reviewedAt), "MMM d")}</p>
                      )}
                    </div>
                  </div>
                  <div className="bg-secondary p-4 rounded-xl border border-border">
                    <p className="text-sm text-muted-foreground leading-relaxed italic">"{project.counselorNote}"</p>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Right Column: Project Details & Files */}
            <div className="lg:w-2/3 space-y-6">

              {!project && !isEditing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full min-h-[400px] flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-xl bg-secondary"
                >
                  <div className="w-20 h-20 bg-secondary text-muted-foreground rounded-full flex items-center justify-center mb-6 border border-border">
                    <GraduationCap className="h-10 w-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Your Capstone Journey Awaits</h3>
                  <p className="text-muted-foreground text-center max-w-md mb-8">
                    The senior project is your opportunity to explore a passion, conduct research, and demonstrate what you've learned.
                  </p>
                  <Button
                    size="lg"
                    onClick={() => setIsEditing(true)}
                    className="bg-foreground text-background hover:bg-foreground/90 rounded-xl h-12 px-8 font-semibold"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Start Your Project
                  </Button>
                </motion.div>
              )}

              {/* Edit Form Card */}
              <AnimatePresence>
                {isEditing && (
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
                          {project ? "Edit Overview" : "Start Project Proposal"}
                        </h3>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-muted-foreground font-bold text-sm uppercase tracking-wider">Project Title *</Label>
                        <Input
                          className="h-12 px-4 text-lg font-medium bg-secondary border-border rounded-xl"
                          placeholder="e.g. Sustainable Water Filtration System"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-muted-foreground font-bold text-sm uppercase tracking-wider">Project Proposal / Description</Label>
                        <Textarea
                          className="min-h-[200px] p-4 text-base bg-secondary border-border rounded-xl resize-y"
                          placeholder="Detail your research question, methodology, expected outcomes, and why this matters..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border">
                        <Button variant="ghost" className="h-12 px-6 rounded-xl font-semibold hover:bg-secondary text-muted-foreground" onClick={() => setIsEditing(false)}>
                          Cancel
                        </Button>
                        <Button
                          disabled={isMutating || !title.trim()}
                          onClick={project ? handleUpdate : handleCreate}
                          className="h-12 px-8 bg-foreground text-background hover:bg-foreground/90 rounded-xl border-0 font-semibold"
                        >
                          {isMutating ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Save className="h-5 w-5 mr-2" />}
                          {project ? "Save Changes" : "Create Project"}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* View Mode Details */}
              {project && !isEditing && (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  custom={2}
                  variants={cardVariants}
                  className="dash-card p-5"
                >
                  <div className="mb-6">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> Project Overview
                    </p>
                    <h2 className="text-2xl font-bold text-foreground mb-5 leading-tight">{project.title}</h2>
                    <div className="text-muted-foreground leading-relaxed bg-secondary rounded-xl p-5 border border-border">
                      {project.description ? (
                        <p className="whitespace-pre-wrap">{project.description}</p>
                      ) : (
                        <p className="italic text-muted-foreground">No detailed description provided yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h4 className="text-lg font-bold text-foreground">Project Files</h4>
                        <p className="text-sm text-muted-foreground">Upload drafts, research papers, and presentations.</p>
                      </div>
                      {canEdit && (
                        <>
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.ppt,.pptx"
                            onChange={handleFileUpload}
                          />
                          <Button
                            variant="outline"
                            disabled={uploadMutation.isPending}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-border text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl"
                          >
                            {uploadMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <FileUp className="h-4 w-4 mr-2" />
                            )}
                            Upload File
                          </Button>
                        </>
                      )}
                    </div>

                    {project.attachments.length === 0 ? (
                      <div className="py-10 px-6 bg-secondary border border-dashed border-border rounded-xl text-center">
                        <Paperclip className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">No files attached</p>
                        <p className="text-xs text-muted-foreground mt-1">Upload relevant documents for your project.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {project.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col p-4 rounded-xl border border-border hover:border-foreground/20 transition-colors bg-card"
                          >
                            <div className="flex items-start gap-3 mb-3">
                              <div className="p-2.5 bg-secondary text-muted-foreground rounded-xl group-hover:bg-foreground group-hover:text-background transition-colors border border-border">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0 pt-1">
                                <p className="text-sm font-bold text-foreground truncate pr-2" title={att.fileName}>
                                  {att.fileName}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                              <span>{(att.fileSize / 1024).toFixed(0)} KB</span>
                              <span>{format(new Date(att.uploadedAt), "MMM d, yy")}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
