"use client";

import { redirect } from "next/navigation";

export default function DataMappingsPage() {
  redirect("/school-admin/settings?tab=integrations");
}
