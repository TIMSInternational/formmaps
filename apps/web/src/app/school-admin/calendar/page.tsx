"use client";

import { redirect } from "next/navigation";

export default function CalendarPage() {
  redirect("/school-admin/settings?tab=calendar");
}
