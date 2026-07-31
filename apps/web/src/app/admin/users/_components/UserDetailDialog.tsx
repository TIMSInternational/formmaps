"use client";

import { toast } from "sonner";
import { Mail, UserCheck, UserX, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joinedDate: string;
  subscriptionStatus?: string;
}

interface UserDetailDialogProps {
  user: UserRecord | null;
  onClose: () => void;
  onDeactivate: (user: UserRecord) => void;
}

export function UserDetailDialog({ user, onClose, onDeactivate }: UserDetailDialogProps) {
  const { t } = useTranslation("platform_owner");
  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl border-gray-100 shadow-2xl p-0 overflow-hidden">
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
                    {user.role}
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
                <Badge variant={user.status === "active" ? "default" : "secondary"}
                  className={`font-medium shadow-none border-0 ${user.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                  {user.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <Users className="h-4 w-4 text-gray-400" />
                {t("users.joinedOn", { date: new Date(user.joinedDate).toLocaleDateString() })}
              </div>
            </div>
            <div className="border-t border-gray-100 p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("users.detailActions")}</p>
              <button onClick={() => { navigator.clipboard.writeText(user.email); toast.success("Email copied"); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-left">
                <Mail className="h-4 w-4 text-gray-400" /> {t("users.copyEmail")}
              </button>
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
