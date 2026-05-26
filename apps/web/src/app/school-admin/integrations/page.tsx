"use client";

import { redirect } from "next/navigation";

export default function IntegrationsPage() {
  redirect("/school-admin/settings?tab=integrations");
}
