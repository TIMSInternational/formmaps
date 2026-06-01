"use client";

import { redirect } from "next/navigation";

export default function SchoolAdminAlertsPage() {
  redirect("/school-admin/messages?tab=alerts");
}
