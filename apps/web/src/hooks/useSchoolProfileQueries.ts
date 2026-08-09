"use client";

import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSchoolProfile,
  updateSchoolProfile,
  uploadSchoolLogo,
  getSchoolUsers,
  inviteStaff,
  bulkInviteStaff,
  updateUserRole,
  assignStudents,
  unassignStudents,
  getCounselorStudents,
  getAllCounselorAssignments,
  getMyCounselorStudents,
  getMyCounselorStudentDetail,
} from "@/services/schoolProfileService";
import type {
  SchoolAddress,
  SchoolProfile,
  SchoolProfilePayload,
  SchoolRole,
  SchoolUser,
  SchoolUsersResponse,
  StaffInvitePayload,
  BulkStaffInvitePayload,
  StudentAssignPayload,
  CounselorStudentsResponse,
} from "@/types/assessmentConfig";
import {
  keyParams,
  optimisticId,
  patchEnvelope,
  removeBy,
  useOptimisticCache,
} from "./useOptimisticCache";

// ── formmaps#89: optimistic school-admin writes ─────────────────────────────────
// Every write in this file used to cost TWO sequential round trips before the screen
// changed: the mutation, then an invalidate-driven refetch. The general rules live in
// useOptimisticCache.ts; what is specific to this file is which of the seven writes
// can honestly be predicted and which cannot.
//
//   updateSchoolProfile -> YES. The user typed every field being written, and the PUT
//                          echoes the whole schools row back, so `replace` retires the
//                          refetch outright.
//   uploadSchoolLogo    -> NO. The URL is assigned by S3. See the hook.
//   inviteStaff         -> YES, as a placeholder row. See the hook.
//   bulkInviteStaff     -> NO. The server decides which of N invites succeed.
//   updateUserRole      -> NO. The endpoint does not exist. See the hook.
//   assignStudents      -> PARTLY. See the hook: the pairs yes, the caseload rows no.
//   unassignStudents    -> YES. A removal invents nothing.
//
// Deliberately NO toasts here, unlike the notes/course-plan hooks: every consumer of
// this file (ProfilePanel, StaffPanel, CounselorRow) already passes its own
// onSuccess/onError toast to `mutate`, and a hook-level toast would fire a second one.

// ============================================
// Query Keys
// ============================================

export const schoolProfileKeys = {
  all: ["school-profile"] as const,
  profile: () => [...schoolProfileKeys.all, "profile"] as const,
  users: () => [...schoolProfileKeys.all, "users"] as const,
  userList: (params?: object) => [...schoolProfileKeys.users(), "list", params] as const,
  /** Every cached page of ONE counselor's caseload — the unit an assign/unassign touches. */
  counselorStudentsAll: (counselorId: string) =>
    [...schoolProfileKeys.all, "counselor-students", counselorId] as const,
  counselorStudents: (counselorId: string, params?: object) =>
    [...schoolProfileKeys.counselorStudentsAll(counselorId), params] as const,
  myCounselorStudents: (params?: object) =>
    [...schoolProfileKeys.all, "my-students", params] as const,
  allAssignments: () => [...schoolProfileKeys.all, "all-assignments"] as const,
};

/** The whole school-profile cache. Broad on purpose — see the assign/unassign hooks. */
const everythingFilter = { queryKey: schoolProfileKeys.all, refetchType: "all" } as const;
const profileFilter = { queryKey: schoolProfileKeys.profile() };
/** Every cached page and role/search filter of the user list — one write touches all of them. */
const userListFilter = { queryKey: schoolProfileKeys.users() };
const caseloadFilter = (counselorId: string) => ({
  queryKey: schoolProfileKeys.counselorStudentsAll(counselorId),
});
const assignmentsFilter = { queryKey: schoolProfileKeys.allAssignments() };

// ============================================
// School Profile Hooks (SCRUM-130)
// ============================================

export function useSchoolProfile() {
  return useQuery({
    queryKey: schoolProfileKeys.profile(),
    queryFn: getSchoolProfile,
    staleTime: 1000 * 60 * 30,
  });
}

/** The five sub-fields the server rebuilds the address jsonb from, in its order. */
const ADDRESS_FIELDS = ["street", "city", "state", "country", "postalCode"] as const;

/** The scalar profile columns the PUT allow-list will actually write. */
const PROFILE_SCALARS = ["name", "phone", "email", "website", "timezone"] as const;

/**
 * The scalars from `payload` that will really reach the server, with `undefined`
 * dropped: the body is JSON-encoded and JSON.stringify omits an undefined value
 * entirely, so a key the caller left undefined never arrives and the server never
 * writes it. ProfilePanel sends `name: form.name || undefined` for a blank field, so
 * spreading the payload as-is would blank the cached name for a change the server
 * declined to make.
 */
function definedScalars(payload: SchoolProfilePayload): Partial<SchoolProfile> {
  const out: Partial<SchoolProfile> = {};
  for (const field of PROFILE_SCALARS) {
    const value = payload[field];
    if (typeof value === "string") out[field] = value;
  }
  return out;
}

/**
 * Mirror of the server's address handling: the jsonb column is a FULL REPLACE built
 * from exactly the five fields above, so a partial address CLEARS the ones it omits
 * rather than keeping them. Merging over `current.address` here would show the old
 * street next to the new city until the next fetch disagreed.
 *
 * A dropped field is represented as "" rather than deleted, which is what every reader
 * of this object already coalesces an absent field to.
 */
function replacedAddress(address: Partial<SchoolAddress>): SchoolAddress {
  const out = {} as SchoolAddress;
  for (const field of ADDRESS_FIELDS) {
    const value = address[field];
    out[field] = typeof value === "string" ? value : "";
  }
  return out;
}

export function useUpdateSchoolProfile() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (data: SchoolProfilePayload) => updateSchoolProfile(data),

    onMutate: (data) =>
      optimistic.patch<SchoolProfile>(profileFilter, (current) => ({
        ...current,
        ...definedScalars(data),
        ...(data.address ? { address: replacedAddress(data.address) } : {}),
      })),

    // The PUT answers with the whole schools row, so this response IS what a refetch
    // would have returned and there is no invalidate at all — the second round trip is
    // gone, not merely hidden. Merged rather than substituted, following the notes
    // hooks: anything the read carries that the write response does not (a logo the
    // GET resolved, a derived student count) survives instead of blanking.
    //
    // It also self-corrects the one field the optimistic step can get wrong: the server
    // silently ignores a non-empty invalid `email`, so an invalid address shows for the
    // duration of the request and then snaps back to the stored one.
    onSuccess: (profile) => {
      optimistic.replace<SchoolProfile>(profileFilter, (current) => ({ ...current, ...profile }));
    },

    onError: (_err, _data, context) => optimistic.rollback(context),
  });
}

export function useUploadSchoolLogo() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (file: File) => uploadSchoolLogo(file),

    // NO onMutate. The logo URL is assigned by S3 during the upload, so there is
    // nothing on the client to show that is not a guess: a `blob:` object URL would
    // render, but it would be a fabricated value sitting in the cache under the name of
    // a server field (and one that leaks until revoked). The file input is the
    // affordance the user just used, so a spinner there is honest and a wrong URL is
    // not. What #89 still buys is below.

    // The upload response carries the real URL, so it goes straight into the cached
    // profile instead of triggering a refetch of the whole row for one field.
    onSuccess: ({ logoUrl }) => {
      optimistic.replace<SchoolProfile>(profileFilter, (current) => ({ ...current, logoUrl }));
    },
  });
}

// ============================================
// User Management Hooks (SCRUM-134)
// ============================================

export function useSchoolUsers(params?: {
  role?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: schoolProfileKeys.userList(params),
    queryFn: () => getSchoolUsers(params),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
}

type UserListParams = { role?: string; status?: string; search?: string; page?: number };

/**
 * A cached user-list row. The declared `SchoolUser` calls the role `role`; GET
 * /school-admin/users actually sends `roleName`, which is why StaffPanel reads
 * `user.roleName || user.role`. Rows written from here carry BOTH so neither reader
 * sees a blank; the field-name gap itself is not this file's to fix.
 */
type SchoolUserRow = SchoolUser & { roleName?: string };
type SchoolUsersCache = Omit<SchoolUsersResponse, "data"> & { data: SchoolUserRow[] };

const roleOf = (user: SchoolUserRow) => (user.roleName ?? user.role ?? "").toLowerCase();

/**
 * The server's role filter is `"roleName" ILIKE '%role%'` — a case-insensitive
 * SUBSTRING match, not equality, which is why the "admin" option matches
 * `school_admin`. Mirrored exactly so an optimistic row lands in the same entries the
 * refetch will put it in.
 */
const matchesRoleFilter = (filter: string | undefined, role: string) =>
  !filter || role.includes(filter.toLowerCase());

/** The server's search filter: `name ILIKE '%s%' OR email ILIKE '%s%'`. */
const matchesSearchFilter = (search: string | undefined, user: SchoolUserRow) => {
  if (!search) return true;
  const needle = search.toLowerCase();
  return (
    (user.name ?? "").toLowerCase().includes(needle) ||
    (user.email ?? "").toLowerCase().includes(needle)
  );
};

export function useInviteStaff() {
  const optimistic = useOptimisticCache();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StaffInvitePayload) => inviteStaff(data),

    onMutate: (data) => {
      const now = new Date().toISOString();
      const pending: SchoolUserRow = {
        id: optimisticId(),
        name: data.name,
        email: data.email,
        roleName: data.roleName,
        // The declared union has no "teacher"/"coach" member even though the invite
        // form offers Coach; `roleName` above is the field the table actually reads.
        role: data.roleName as SchoolRole,
        // The frontend's own word for an invitation that has been sent and not yet
        // accepted. It is the one field the reconcile may change: the list endpoint
        // derives status from `isActive`, which this client cannot see.
        status: "pending",
        joinedAt: now,
        // Left empty rather than guessed — the list endpoint does not send it and no
        // column renders it, exactly like the notes hooks' authorId.
        lastActive: "",
      };

      return optimistic.patch<SchoolUsersCache>(userListFilter, (current, key) => {
        const params = keyParams<UserListParams>(key);
        // The list is ordered `createdDate DESC, id ASC`, so the newest user is the
        // first row of page 1 and belongs nowhere else …
        if ((params.page ?? 1) !== 1) return undefined;
        // … and only in the role/search filters it actually matches. `status` is NOT
        // consulted: the endpoint ignores that query param entirely, so a cache entry
        // keyed with one is an unfiltered list and must receive the row.
        if (!matchesRoleFilter(params.role, data.roleName.toLowerCase())) return undefined;
        if (!matchesSearchFilter(params.search, pending)) return undefined;
        return patchEnvelope(current, (rows) => [pending, ...rows]);
      });
    },

    // Invalidated rather than replaced from the response: the invite endpoint answers
    // with an envelope this client cannot pin down (StaffPanel reads an `emailSent`
    // flag off it), and the row it creates carries server-owned columns — the real id,
    // gradeLevel, the isActive-derived status. One refetch settles all of them.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.users() });
    },

    onError: (_err, _data, context) => optimistic.rollback(context),
  });
}

export function useBulkInviteStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkStaffInvitePayload) => bulkInviteStaff(data),

    // NO optimistic update, deliberately. This endpoint is partial-failure by design —
    // it answers { invited, failed, results: [{ email, status }] } — so the client
    // cannot know which of N rows to insert. Inserting all N and deleting the failures
    // a beat later shows users that never existed, which is worse than the wait; the
    // panel's own summary of `results` is the honest report.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.users() });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateUserRole(userId, role),

    // NO optimistic update — and NOT because the patch is hard. It is the easy one: the
    // new role is right there in the argument. The reason is that
    // PUT /api/v1/school-admin/users/:userId/role DOES NOT EXIST.
    //
    // Neither backend serves it. The legacy router mounted at /api/v1/school-admin
    // (api/src/routes/school.ts) carries PUT /users/:userId/grade-level and no role
    // path; no other router mounted on that prefix declares one either. The .NET port
    // (SchoolUsersEndpoints.cs) maps exactly grade-level plus the two assign-students
    // verbs. The unrelated PUT /api/role/:id router is role-CRUD behind admin:roles,
    // not a per-user role assignment. So this call 404s.
    //
    // formmaps#111 is this same mistake made four times over: mutations predicted
    // against endpoints nobody had built, so users watch a row change and then snap
    // back. An optimistic update is a PROMISE that the write will land, and this one
    // cannot keep it — the more convincing the patch, the worse the lie. It stays
    // pessimistic until the endpoint exists, at which point the patch belongs here,
    // removal-from-a-role-filtered-list and all (a role change can move a user OUT of
    // a filtered list, so patching in place would strand a Counselor row in a list
    // filtered to Staff — that is the shape to restore, not a plain patchBy).
    //
    // Note this hook currently has no UI caller; it is exported and unused. That is why
    // the dead optimistic path was never seen in production, not a reason to keep it.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.users() });
    },
  });
}

/** The pair list GET /counselor-assignments/all returns — client-known in full. */
type CounselorAssignment = { studentId: string; counselorId: string };

export function useAssignStudents() {
  const optimistic = useOptimisticCache();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      counselorId,
      payload,
    }: {
      counselorId: string;
      payload: StudentAssignPayload;
    }) => assignStudents(counselorId, payload),

    // Only the assignment PAIRS are predicted. The caseload list is deliberately NOT
    // extended: its rows carry name, email and gradeLevel that this mutation only has
    // ids for, and the endpoint orders by the assignment row's own id, so even the
    // position of a synthesised row would be a guess. Unassign below is asymmetric for
    // exactly that reason — a removal invents nothing.
    onMutate: ({ counselorId, payload }) =>
      optimistic.patch<CounselorAssignment[]>(assignmentsFilter, (current) => {
        const added = payload.studentIds
          .filter(
            (studentId) =>
              !current.some((a) => a.studentId === studentId && a.counselorId === counselorId),
          )
          .map((studentId) => ({ studentId, counselorId }));
        // Nothing new to add — decline rather than rewrite the entry with an equal copy.
        return added.length ? [...current, ...added] : undefined;
      }),

    // Stays as broad as it was. An assignment moves the user list's per-counselor
    // counts, both counselors' caseloads, and the affected students' own /me list —
    // and `refetchType: "all"` because the losing counselor's caseload is typically an
    // unmounted (inactive) query by the time the write lands.
    onSettled: () => {
      queryClient.invalidateQueries(everythingFilter);
    },

    onError: (_err, _vars, context) => optimistic.rollback(context),
  });
}

export function useUnassignStudents() {
  const optimistic = useOptimisticCache();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      counselorId,
      payload,
    }: {
      counselorId: string;
      payload: StudentAssignPayload;
    }) => unassignStudents(counselorId, payload),

    onMutate: async ({ counselorId, payload }) => {
      const removed = new Set(payload.studentIds);

      // The caseload table is what the user is looking at when they click Remove, and
      // dropping a row from it is exact — no server-computed field is being invented.
      // patchEnvelope carries `total` down with it so the caseload count in the header
      // does not keep claiming the student for the duration of the request.
      const caseload = await optimistic.patch<CounselorStudentsResponse>(
        caseloadFilter(counselorId),
        (current) => patchEnvelope(current, (rows) => removeBy(rows, (s) => removed.has(s.id))),
      );

      const assignments = await optimistic.patch<CounselorAssignment[]>(
        assignmentsFilter,
        (current) =>
          removeBy(current, (a) => a.counselorId === counselorId && removed.has(a.studentId)),
      );

      // ONE context spanning both caches, so a single `rollback` restores every entry
      // either patch touched. The counselor's own `my-students` list is not touched:
      // that key is not counselor-scoped, so this client cannot tell whether the
      // caller IS the counselor being edited. The invalidate below covers it.
      return { snapshot: [...caseload.snapshot, ...assignments.snapshot] };
    },

    onSettled: () => {
      queryClient.invalidateQueries(everythingFilter);
    },

    onError: (_err, _vars, context) => optimistic.rollback(context),
  });
}

// ============================================
// Counselor Student Hooks (SCRUM-145)
// ============================================

export function useCounselorStudents(
  counselorId: string,
  params?: { page?: number; limit?: number; search?: string }
) {
  return useQuery({
    queryKey: schoolProfileKeys.counselorStudents(counselorId, params),
    queryFn: () => getCounselorStudents(counselorId, params),
    enabled: !!counselorId,
    staleTime: 0,
  });
}

export function useAllCounselorAssignments() {
  return useQuery({
    queryKey: schoolProfileKeys.allAssignments(),
    queryFn: getAllCounselorAssignments,
    staleTime: 1000 * 60 * 2,
  });
}

export function useMyCounselorStudents(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  return useQuery({
    queryKey: schoolProfileKeys.myCounselorStudents(params),
    queryFn: () => getMyCounselorStudents(params),
    staleTime: 1000 * 60 * 2,
    placeholderData: keepPreviousData,
  });
}

export function useMyCounselorStudentDetail(studentId?: string) {
  return useQuery({
    queryKey: [...schoolProfileKeys.myCounselorStudents(), "detail", studentId],
    queryFn: () => getMyCounselorStudentDetail(studentId!),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 2,
  });
}
