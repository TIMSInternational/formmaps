"use client";

import { useState } from "react";
import { motion } from "motion/react";
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
  useMyParents,
  useInviteMyParent,
  useRevokeMyParentAccess,
  useResendMyParentInvite,
} from "@/hooks/useParentPortalQueries";
import type { ParentRelationship, StudentParentLink } from "@/types/parentPortal";
import { cn } from "@/lib/utils";

// i18n keys (common namespace) for each relationship value
const RELATIONSHIP_LABEL_KEYS: Record<ParentRelationship, string> = {
  mother: "components.StudentInviteParentPanel.relationship.mother",
  father: "components.StudentInviteParentPanel.relationship.father",
  sibling: "components.StudentInviteParentPanel.relationship.sibling",
  guardian: "components.StudentInviteParentPanel.relationship.guardian",
  other: "components.StudentInviteParentPanel.relationship.other",
};

const RELATIONSHIP_COLORS: Record<ParentRelationship, string> = {
  mother: "bg-pink-100 text-pink-700",
  father: "bg-blue-100 text-blue-700",
  sibling: "bg-purple-100 text-purple-700",
  guardian: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

const STATUS_CONFIG = {
  accepted: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", labelKey: "components.StudentInviteParentPanel.status.accepted" },
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", labelKey: "components.StudentInviteParentPanel.status.pending" },
  expired: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", labelKey: "components.StudentInviteParentPanel.status.expired" },
};

function ParentRow({ parent }: { parent: StudentParentLink }) {
  const { t } = useTranslation();
  const revoke = useRevokeMyParentAccess();
  const resend = useResendMyParentInvite();
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
        <AvatarFallback className="bg-[var(--admin-accent-blue)]/10 text-[var(--admin-accent-blue)] font-semibold text-sm">
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
            className="h-7 w-7 text-gray-400 hover:text-[var(--admin-accent-blue)]"
            title={t("components.StudentInviteParentPanel.resendInvite")}
            disabled={resend.isPending}
            onClick={() => resend.mutate({ parentLinkId: parent.id, email: parent.email })}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-400 hover:text-red-600"
          title={t("components.StudentInviteParentPanel.revokeAccess")}
          disabled={revoke.isPending}
          onClick={() => revoke.mutate(parent.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}

export function StudentInviteParentPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<ParentRelationship>("mother");
  const [message, setMessage] = useState("");

  const { data: parents, isLoading } = useMyParents();
  const invite = useInviteMyParent();

  const handleInvite = async () => {
    if (!name.trim() || !email.trim()) return;
    await invite.mutateAsync({
      name: name.trim(),
      email: email.trim(),
      relationship,
      message: message.trim() || undefined,
    });
    setName("");
    setEmail("");
    setRelationship("mother");
    setMessage("");
    setOpen(false);
  };

  const parentList = parents ?? [];
  const acceptedCount = parentList.filter((p) => p.status === "accepted").length;
  const pendingCount = parentList.filter((p) => p.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--admin-accent-blue)]" />
            {t("components.StudentInviteParentPanel.title")}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {t("components.StudentInviteParentPanel.linkedCount", { count: acceptedCount })} · {t("components.StudentInviteParentPanel.pendingCount", { count: pendingCount })}
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 bg-[var(--admin-accent-blue)] hover:bg-[var(--admin-accent-blue)]/90 text-white">
              <UserPlus className="h-4 w-4" />
              {t("components.StudentInviteParentPanel.inviteParent")}
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("profile.inviteParent.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("profile.inviteParent.dialogDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-name">{t("components.StudentInviteParentPanel.fullName")}</Label>
                  <Input
                    id="parent-name"
                    placeholder={t("components.StudentInviteParentPanel.namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-email">{t("components.StudentInviteParentPanel.email")}</Label>
                  <Input
                    id="parent-email"
                    type="email"
                    placeholder={t("components.StudentInviteParentPanel.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label>{t("components.StudentInviteParentPanel.relationshipLabel")}</Label>
                  <Select
                    value={relationship}
                    onValueChange={(v) => setRelationship(v as ParentRelationship)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mother">{t(RELATIONSHIP_LABEL_KEYS.mother)}</SelectItem>
                      <SelectItem value="father">{t(RELATIONSHIP_LABEL_KEYS.father)}</SelectItem>
                      <SelectItem value="sibling">{t(RELATIONSHIP_LABEL_KEYS.sibling)}</SelectItem>
                      <SelectItem value="guardian">{t(RELATIONSHIP_LABEL_KEYS.guardian)}</SelectItem>
                      <SelectItem value="other">{t(RELATIONSHIP_LABEL_KEYS.other)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-msg">
                    {t("components.StudentInviteParentPanel.personalMessage")}{" "}
                    <span className="text-xs text-gray-400">{t("components.StudentInviteParentPanel.optional")}</span>
                  </Label>
                  <Textarea
                    id="parent-msg"
                    placeholder={t("components.StudentInviteParentPanel.messagePlaceholder")}
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
                className="gap-2 bg-[var(--admin-accent-blue)] hover:bg-[var(--admin-accent-blue)]/90 text-white"
              >
                <Send className="h-4 w-4" />
                {invite.isPending ? t("components.StudentInviteParentPanel.sending") : t("components.StudentInviteParentPanel.sendInvite")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Parent List */}
      <div className="space-y-2">
        {isLoading ? (
          [1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800" />)
        ) : parentList.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/50">
            <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">
              {t("components.StudentInviteParentPanel.emptyTitle")}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t("components.StudentInviteParentPanel.emptyDescription")}
            </p>
          </div>
        ) : (
          parentList.map((parent) => (
            <ParentRow key={parent.id} parent={parent} />
          ))
        )}
      </div>
    </div>
  );
}
