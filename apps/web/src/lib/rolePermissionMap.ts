import { Roles, Permissions, type RoleName } from "./permissions";

/**
 * Client-side mirror of backend RolePermissionMap.
 * Used as fallback when permissions aren't available from the JWT/API.
 */
const rolePermissionMap: Record<RoleName, string[]> = {
  [Roles.SUPER_ADMIN]: [
    Permissions.Admin.Dashboard, Permissions.Admin.Users, Permissions.Admin.Schools,
    Permissions.Admin.Roles, Permissions.Admin.Plans, Permissions.Admin.Payouts,
    Permissions.Admin.Coaches,
    Permissions.School.Manage, Permissions.School.Users, Permissions.School.Billing,
    Permissions.School.Integrations, Permissions.School.DataMapping,
    Permissions.Students.Read, Permissions.Students.Write, Permissions.Students.Import,
    Permissions.Courses.Read, Permissions.Courses.Write,
    Permissions.CoursePlans.Read, Permissions.CoursePlans.Write,
    Permissions.Grades.Read, Permissions.Grades.Import,
    Permissions.Assessments.Read,
    Permissions.Evaluations.Read, Permissions.Evaluations.Manage,
    Permissions.Reports.Read, Permissions.Reports.School,
    Permissions.Alerts.Read, Permissions.Alerts.Manage,
    Permissions.Careers.Read, Permissions.Universities.Read,
    Permissions.Profile.Read, Permissions.Profile.Write,
    Permissions.Subscriptions.Read, Permissions.Subscriptions.Manage,
  ],

  [Roles.SCHOOL_ADMIN]: [
    Permissions.School.Manage, Permissions.School.Users, Permissions.School.Billing,
    Permissions.School.Integrations, Permissions.School.DataMapping,
    Permissions.Students.Read, Permissions.Students.Write, Permissions.Students.Import,
    Permissions.Courses.Read, Permissions.Courses.Write,
    Permissions.CoursePlans.Read, Permissions.CoursePlans.Write, Permissions.CoursePlans.Approve,
    Permissions.Grades.Read, Permissions.Grades.Import,
    Permissions.Assessments.Read,
    Permissions.Evaluations.Read, Permissions.Evaluations.Manage,
    Permissions.Reports.Read, Permissions.Reports.School,
    Permissions.Alerts.Read, Permissions.Alerts.Manage,
    Permissions.Careers.Read, Permissions.Universities.Read,
    Permissions.Profile.Read, Permissions.Profile.Write,
    Permissions.Subscriptions.Read,
  ],

  [Roles.COUNSELOR]: [
    Permissions.Students.Read,
    Permissions.Courses.Read,
    Permissions.CoursePlans.Read, Permissions.CoursePlans.Write, Permissions.CoursePlans.Approve,
    Permissions.Grades.Read,
    Permissions.Assessments.Read,
    Permissions.Evaluations.Read, Permissions.Evaluations.Submit,
    Permissions.Reports.Read,
    Permissions.Alerts.Read, Permissions.Alerts.Manage,
    Permissions.Counselor.Dashboard, Permissions.Counselor.Notes, Permissions.Counselor.Sessions,
    Permissions.Careers.Read, Permissions.Universities.Read,
    Permissions.Profile.Read, Permissions.Profile.Write,
  ],

  [Roles.STUDENT]: [
    Permissions.Students.Read, Permissions.Students.Write,
    Permissions.Courses.Read,
    Permissions.CoursePlans.Read, Permissions.CoursePlans.Write,
    Permissions.Grades.Read,
    Permissions.Assessments.Take, Permissions.Assessments.Read,
    Permissions.Evaluations.Read,
    Permissions.Reports.Read,
    Permissions.Coaching.Book,
    Permissions.Careers.Read, Permissions.Universities.Read,
    Permissions.Resume.Manage, Permissions.Portfolio.Manage, Permissions.Learning.Access,
    Permissions.Profile.Read, Permissions.Profile.Write,
    Permissions.Subscriptions.Read,
  ],

  [Roles.COACH]: [
    Permissions.Students.Read,
    Permissions.Coaching.Dashboard, Permissions.Coaching.Sessions,
    Permissions.Coaching.Earnings, Permissions.Coaching.Profile,
    Permissions.Profile.Read, Permissions.Profile.Write,
  ],

  [Roles.PARENT]: [
    Permissions.Students.Read,
    Permissions.Courses.Read,
    Permissions.CoursePlans.Read,
    Permissions.Grades.Read,
    Permissions.Assessments.Read,
    Permissions.Evaluations.Read, Permissions.Evaluations.Submit,
    Permissions.Reports.Read,
    Permissions.Counselor.SessionRequest,
    Permissions.Parent.Dashboard, Permissions.Parent.Children,
    Permissions.Careers.Read, Permissions.Universities.Read,
    Permissions.Profile.Read, Permissions.Profile.Write,
  ],
};

export function getRolePermissions(role: RoleName): string[] {
  return rolePermissionMap[role] ?? [];
}
