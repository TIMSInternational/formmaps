"use client";

import { redirect } from "next/navigation";

export default function ISAMSIntegrationPage() {
  redirect("/school-admin/settings?tab=integrations");
}
