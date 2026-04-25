"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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

const RELATIONSHIP_LABELS: Record<ParentRelationship, string> = {
  mother: "Mother",
  father: "Father",
  sibling: "Sibling",
  guardian: "Guardian",
  other: "Other",
};

const RELATIONSHIP_COLORS: Record<ParentRelationship, string> = {
  mother: "bg-pink-100 text-pink-700",
  father: "bg-blue-100 text-blue-700",
  sibling: "bg-purple-100 text-purple-700",
  guardian: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

const STATUS_CONFIG = {
  accepted: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", label: "Accepted" },
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", label: "Invite Sent" },
  expired: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", label: "Expired" },
};

function ParentRow({ parent }: { parent: StudentParentLink }) {
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
        <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold text-sm">
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
            {RELATIONSHIP_LABELS[parent.relationship]}
          </Badge>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Mail className="h-3 w-3 text-gray-400" />
          <p className="text-xs text-gray-500 truncate">{parent.email}</p>
        </div>
      </div>

      <div className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium", cfg.bg, cfg.color)}>
        <StatusIcon className="h-3 w-3" />
        {cfg.label}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {parent.status !== "accepted" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-blue-600"
            title="Resend invite"
            disabled={resend.isPending}
            onClick={() => resend.mutate(parent.id)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-400 hover:text-red-600"
          title="Revoke access"
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
            <Users className="h-4 w-4 text-blue-500" />
            Parents & Guardians
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {acceptedCount} linked · {pendingCount} pending invite
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              <UserPlus className="h-4 w-4" />
              Invite Parent
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Parent / Guardian</DialogTitle>
              <DialogDescription>
                Send a portal access invite to link a parent or guardian to your account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-name">Full Name *</Label>
                  <Input
                    id="parent-name"
                    placeholder="e.g. Maria Gonzalez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-email">Email Address *</Label>
                  <Input
                    id="parent-email"
                    type="email"
                    placeholder="parent@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label>Relationship to Student</Label>
                  <Select
                    value={relationship}
                    onValueChange={(v) => setRelationship(v as ParentRelationship)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mother">Mother</SelectItem>
                      <SelectItem value="father">Father</SelectItem>
                      <SelectItem value="sibling">Sibling</SelectItem>
                      <SelectItem value="guardian">Guardian</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="parent-msg">
                    Personal Message{" "}
                    <span className="text-xs text-gray-400">(optional)</span>
                  </Label>
                  <Textarea
                    id="parent-msg"
                    placeholder="Add a short message to the invite email..."
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleInvite}
                disabled={!name.trim() || !email.trim() || invite.isPending}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Send className="h-4 w-4" />
                {invite.isPending ? "Sending…" : "Send Invite"}
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
              No parents or guardians linked yet
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Click "Invite Parent" to send a portal access invite
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
