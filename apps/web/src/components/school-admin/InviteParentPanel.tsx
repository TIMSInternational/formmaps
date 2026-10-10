"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  UserPlus,
  Mail,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Users,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  useStudentParents,
  useInviteParent,
  useRevokeParentAccess,
  useResendParentInvite,
} from "@/hooks/useParentPortalQueries";
import type { ParentPanelScope } from "@/services/parentPortalService";
import type { ParentRelationship, StudentParentLink } from "@/types/parentPortal";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  studentName: string;
  /**
   * audit 2026-10-09 C9: the counselor student page renders this panel too, and the school-admin
   * routes need school:manage (→ 403 for counselors). "counselor" uses the caseload-checked routes;
   * revoke stays school-admin only (the parent-link DELETE is not open to counselors).
   */
  scope?: ParentPanelScope;
}

// i18n keys (common namespace) for each relationship value; the value is API data.
const RELATIONSHIP_LABEL_KEYS: Record<ParentRelationship, string> = {
  mother: "components.inviteParentPanel.relationship.mother",
  father: "components.inviteParentPanel.relationship.father",
  sibling: "components.inviteParentPanel.relationship.sibling",
  guardian: "components.inviteParentPanel.relationship.guardian",
  other: "components.inviteParentPanel.relationship.other",
};
const RELATIONSHIP_ORDER: ParentRelationship[] = ["mother", "father", "sibling", "guardian", "other"];

const RELATIONSHIP_COLORS: Record<ParentRelationship, string> = {
  mother: "bg-pink-100 text-pink-700",
  father: "bg-blue-100 text-blue-700",
  sibling: "bg-purple-100 text-purple-700",
  guardian: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

const STATUS_CONFIG = {
  accepted: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", labelKey: "components.inviteParentPanel.status.accepted" },
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", labelKey: "components.inviteParentPanel.status.pending" },
  expired: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", labelKey: "components.inviteParentPanel.status.expired" },
};

function ParentRow({
  parent,
  studentId,
  scope,
}: {
  parent: StudentParentLink;
  studentId: string;
  scope: ParentPanelScope;
}) {
  const { t } = useTranslation();
  const revoke = useRevokeParentAccess();
  const resend = useResendParentInvite(scope);
  const cfg = STATUS_CONFIG[parent.status];
  const StatusIcon = cfg.icon;

  const initials = parent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 bg-white hover:bg-gray-50 transition-colors"
    >
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-indigo-100 text-indigo-700 font-semibold text-sm">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-gray-900 text-sm truncate">{parent.name}</p>
          <Badge
            variant="secondary"
            className={cn("text-xs px-2 py-0.5", RELATIONSHIP_COLORS[parent.relationship])}
          >
            {t(RELATIONSHIP_LABEL_KEYS[parent.relationship])}
          </Badge>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Mail className="h-3 w-3 text-gray-400" />
          <p className="text-xs text-gray-500 truncate">{parent.email}</p>
        </div>
      </div>

      <div className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium", cfg.bg, cfg.color)}>
        <StatusIcon className="h-3 w-3" />
        {t(cfg.labelKey)}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {parent.status !== "accepted" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-indigo-600"
            title={t("components.inviteParentPanel.resendInvite")}
            disabled={resend.isPending}
            onClick={() =>
              resend.mutate({ studentId, parentLinkId: parent.id, email: parent.email })
            }
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {scope === "school-admin" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-red-600"
            title={t("components.inviteParentPanel.revokeAccess")}
            disabled={revoke.isPending}
            onClick={() =>
              revoke.mutate({ studentId, parentLinkId: parent.id })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function InviteParentPanel({ studentId, studentName, scope = "school-admin" }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<ParentRelationship>("mother");
  const [message, setMessage] = useState("");

  const { data: parents, isLoading } = useStudentParents(studentId, scope);
  const invite = useInviteParent(scope);

  const handleInvite = async () => {
    if (!name.trim() || !email.trim()) return;
    await invite.mutateAsync({
      studentId,
      name: name.trim(),
      email: email.trim(),
      relationship,
      message: message.trim() || undefined,
    });
    setName("");
    setEmail("");
    setRelationship("mother");
    setMessage("");
    setShowForm(false);
    setOpen(false);
  };

  // Fallback if data is missing, or if the hook returns an object with a data array
  const parentList: any[] = Array.isArray(parents) ? parents : ((parents as any)?.data ?? []);
  const acceptedCount = parentList.filter((p: any) => p.status === "accepted").length;
  const pendingCount = parentList.filter((p: any) => p.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-500" />
            {t("components.inviteParentPanel.title")}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {t("components.inviteParentPanel.linkedCount", { count: acceptedCount })} · {t("components.inviteParentPanel.pendingCount", { count: pendingCount })}
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              <UserPlus className="h-4 w-4" />
              {t("components.inviteParentPanel.inviteButton")}
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("components.inviteParentPanel.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("components.inviteParentPanel.dialogDescription")}{" "}
                <span className="font-medium text-gray-900">{studentName}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-name">{t("components.inviteParentPanel.fullName")}</Label>
                  <Input
                    id="parent-name"
                    placeholder={t("components.inviteParentPanel.namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-email">{t("components.inviteParentPanel.email")}</Label>
                  <Input
                    id="parent-email"
                    type="email"
                    placeholder="parent@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label>{t("components.inviteParentPanel.relationshipLabel")}</Label>
                  <Select
                    value={relationship}
                    onValueChange={(v) => setRelationship(v as ParentRelationship)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_ORDER.map((r) => (
                        <SelectItem key={r} value={r}>{t(RELATIONSHIP_LABEL_KEYS[r])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-msg">
                    {t("components.inviteParentPanel.personalMessage")}{" "}
                    <span className="text-xs text-gray-400">{t("components.inviteParentPanel.optional")}</span>
                  </Label>
                  <Textarea
                    id="parent-msg"
                    placeholder={t("components.inviteParentPanel.messagePlaceholder")}
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleInvite}
                disabled={!name.trim() || !email.trim() || invite.isPending}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                <Send className="h-4 w-4" />
                {invite.isPending ? t("components.inviteParentPanel.sending") : t("components.inviteParentPanel.sendInvite")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Parent List */}
      <div className="space-y-2">
        {isLoading ? (
          [1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)
        ) : parentList.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
            <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">
              {t("components.inviteParentPanel.emptyTitle")}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t("components.inviteParentPanel.emptyHint")}
            </p>
          </div>
        ) : (
          parentList.map((parent: any) => (
            <ParentRow key={parent.id} parent={parent} studentId={studentId} scope={scope} />
          ))
        )}
      </div>
    </div>
  );
}
