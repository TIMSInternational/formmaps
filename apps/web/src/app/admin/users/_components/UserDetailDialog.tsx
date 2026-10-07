"use client";

import { toast } from "sonner";
import { Mail, MailPlus, UserCheck, UserX, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRecord } from "./UsersTable";
import { UserStatusBadge } from "./UserStatusBadge";
import { UserAccessEditor } from "./UserAccessEditor";
import { displayStatus } from "./userStatus";

interface UserDetailDialogProps {
  user: UserRecord | null;
  onClose: () => void;
  onDeactivate: (user: UserRecord) => void;
  onActivate: (user: UserRecord) => void;
  onResendInvite: (user: UserRecord) => void;
  /** Role or school changed — the list should refetch. */
  onChanged: () => void;
}

export function UserDetailDialog({ user, onClose, onDeactivate, onActivate, onResendInvite, onChanged }: UserDetailDialogProps) {
  const { t } = useTranslation("platform_owner");
  const { t: tc } = useTranslation();
  const pendingInvite = user ? ["invited", "expired"].includes(displayStatus(user)) : false;
  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[440px] rounded-2xl border-gray-100 shadow-2xl p-0 overflow-hidden max-h-[90dvh] overflow-y-auto">
        {user && (
          <>
            <div className="bg-gray-50/50 p-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-600">
                  {user.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-gray-900">{user.name}</DialogTitle>
                  <Badge variant="outline" className="capitalize font-medium border-gray-200 text-gray-600 bg-white mt-1">
                    {tc(`admin.users.roleNames.${(user.role || "").toLowerCase().replace(/\s+/g, "_")}`, { defaultValue: user.role })}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-gray-700">{user.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <UserCheck className="h-4 w-4 text-gray-400" />
                <UserStatusBadge user={user} />
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <Users className="h-4 w-4 text-gray-400" />
                {t("users.joinedOn", { date: new Date(user.joinedDate).toLocaleDateString() })}
              </div>
            </div>

            <UserAccessEditor user={user} onChanged={onChanged} />

            <div className="border-t border-gray-100 p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("users.detailActions")}</p>
              {pendingInvite && (
                <button onClick={() => onResendInvite(user)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-left">
                  <MailPlus className="h-4 w-4 text-gray-400" /> {tc("admin.users.dropdown.resendInvite")}
                </button>
              )}
              <button onClick={() => {
                  navigator.clipboard?.writeText(user.email).then(
                    () => toast.success(tc("admin.users.emailCopied")),
                    () => undefined,
                  );
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-left">
                <Mail className="h-4 w-4 text-gray-400" /> {t("users.copyEmail")}
              </button>
              {user.status === "inactive" && (
                <button onClick={() => { onClose(); onActivate(user); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-green-700 hover:bg-green-50 transition-colors text-left">
                  <UserCheck className="h-4 w-4" /> {t("users.activateUser")}
                </button>
              )}
              {user.status === "active" && (
                <button onClick={() => { onClose(); onDeactivate(user); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left">
                  <UserX className="h-4 w-4" /> {t("users.deactivateUser")}
                </button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
