import { redirect } from "next/navigation";

/**
 * Audit F: this was a second copy of the bulk-onboard wizard that nothing links to (Users & invites →
 * Bulk onboard opens /school-admin/users/bulk-onboard). Kept as a redirect so an old bookmark does not
 * fall through to the students/[id] page with "bulk-onboard" as a student id.
 */
export default function StudentsBulkOnboardRedirect() {
  redirect("/school-admin/users/bulk-onboard");
}
