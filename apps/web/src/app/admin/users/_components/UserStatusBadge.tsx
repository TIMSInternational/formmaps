"use client";

import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { daysUntil, displayStatus } from "./userStatus";

const TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-gray-100 text-gray-600",
  invited: "bg-amber-50 text-amber-800",
  expired: "bg-red-50 text-red-700",
};

/** Active / Inactive / "Invited · expires in 3 days" / "Invitation expired", translated. */
export function UserStatusBadge({
  user,
}: {
  user: { status: string; inviteStatus?: string | null; inviteExpiresAt?: string | null };
}) {
  const { t } = useTranslation();
  const state = displayStatus(user);

  let label: string;
  if (state === "invited") {
    const days = daysUntil(user.inviteExpiresAt);
    label = days === null
      ? t("admin.users.status.invited")
      : days === 0
        ? t("admin.users.status.invitedExpiresToday")
        : t("admin.users.status.invitedExpiresIn", { count: days });
  } else if (state === "expired") {
    label = t("admin.users.status.expired");
  } else {
    label = t(`admin.users.status.${state}`);
  }

  return (
    <Badge
      variant="secondary"
      data-testid="user-status-badge"
      data-state={state}
      className={`font-medium shadow-none border-0 whitespace-nowrap ${TONE[state]}`}
    >
      {label}
    </Badge>
  );
}
