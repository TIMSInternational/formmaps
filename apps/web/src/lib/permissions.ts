// Role constants — must match backend Authorization/Roles.cs
export const Roles = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "school_admin",
  COUNSELOR: "counselor",
  STUDENT: "student",
  COACH: "coach",
  PARENT: "parent",
} as const;

export type RoleName = (typeof Roles)[keyof typeof Roles];

// Permission constants — must match backend Authorization/Permissions.cs
export const Permissions = {
  Admin: {
    Dashboard: "admin:dashboard",
    Users: "admin:users",
    Schools: "admin:schools",
    Roles: "admin:roles",
    Plans: "admin:plans",
    Payouts: "admin:payouts",
    Coaches: "admin:coaches",
  },
  School: {
    Manage: "school:manage",
    Users: "school:users",
    Billing: "school:billing",
    Integrations: "school:integrations",
    DataMapping: "school:data-mapping",
  },
  Students: {
    Read: "students:read",
    Write: "students:write",
    Import: "students:import",
  },
  Courses: {
    Read: "courses:read",
    Write: "courses:write",
  },
  CoursePlans: {
    Read: "course-plans:read",
    Write: "course-plans:write",
    Approve: "course-plans:approve",
  },
  Grades: {
    Read: "grades:read",
    Import: "grades:import",
  },
  Assessments: {
    Take: "assessments:take",
    Read: "assessments:read",
  },
  Evaluations: {
    Read: "evaluations:read",
    Submit: "evaluations:submit",
    Manage: "evaluations:manage",
  },
  Reports: {
    Read: "reports:read",
    School: "reports:school",
  },
  Alerts: {
    Read: "alerts:read",
    Manage: "alerts:manage",
  },
  Counselor: {
    Dashboard: "counselor:dashboard",
    Notes: "counselor:notes",
    Sessions: "counselor:sessions",
    SessionRequest: "counselor:session-request",
  },
  Coaching: {
    Dashboard: "coaching:dashboard",
    Sessions: "coaching:sessions",
    Book: "coaching:book",
    Earnings: "coaching:earnings",
    Profile: "coaching:profile",
  },
  Parent: {
    Dashboard: "parent:dashboard",
    Children: "parent:children",
  },
  Careers: { Read: "careers:read" },
  Universities: { Read: "universities:read" },
  Resume: { Manage: "resume:manage" },
  Portfolio: { Manage: "portfolio:manage" },
  Learning: { Access: "learning:access" },
  Profile: { Read: "profile:read", Write: "profile:write" },
  Subscriptions: { Read: "subscriptions:read", Manage: "subscriptions:manage" },
} as const;
