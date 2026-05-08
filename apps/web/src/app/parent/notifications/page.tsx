"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  BellOff,
  CheckCheck,
  FileCheck,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useParentNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useParentPortalQueries";
import type { ParentNotification } from "@/types/parentPortal";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<
  ParentNotification["type"],
  { icon: React.ElementType; color: string; bg: string }
> = {
  evaluation: { icon: FileCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
  grade: { icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
  alert: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  meeting: { icon: Calendar, color: "text-purple-600", bg: "bg-purple-50" },
  system: { icon: Info, color: "text-gray-600", bg: "bg-gray-100" },
};

export default function ParentNotificationsPage() {
  const { t } = useTranslation();
  const { data: notifications, isLoading } = useParentNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const list = Array.isArray(notifications) ? notifications : [];
  const unreadCount = list.filter((n: any) => !n.isRead).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Parent</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            {t("parent.notifications.title", "Notifications")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "All caught up!"}
          </p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            <CheckCheck className="h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </motion.div>

      {/* Notification List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-20 dash-card border-dashed">
          <BellOff className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground">No notifications yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            You'll be notified about evaluations, grades, and important updates here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((notif, idx) => {
            const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.system;
            const Icon = cfg.icon;

            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
              >
                <div
                  className={cn(
                    "dash-card p-4 flex items-start gap-4 transition-colors",
                    !notif.isRead && "border-indigo-500/20 bg-indigo-500/5"
                  )}
                >
                  {/* Type Icon */}
                  <div className={cn("p-2.5 rounded-lg shrink-0 mt-0.5", cfg.bg)}>
                    <Icon className={cn("h-4 w-4", cfg.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {notif.title}
                      </p>
                      {!notif.isRead && (
                        <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                      {notif.body}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {formatDistanceToNow(new Date(notif.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>

                  {/* Actions */}
                  {!notif.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 text-xs text-muted-foreground hover:text-indigo-500"
                      onClick={() => markRead.mutate(notif.id)}
                      disabled={markRead.isPending}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
