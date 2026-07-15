"use client";

import { redirect } from "next/navigation";

export default function SchoolProfilePage() {
  redirect("/school-admin/settings?tab=profile");
}
