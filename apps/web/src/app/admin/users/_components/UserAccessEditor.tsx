"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Building2, Loader2, Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  getActiveRoles,
  linkUserToSchool,
  updateUserRole,
  ASSIGNABLE_ROLES,
  type RoleOption,
} from "@/services/adminUsersService";
import { getSchools } from "@/services/schoolService";
import type { School } from "@/types/school";


const roleLabel = (t: (k: string, o?: Record<string, unknown>) => string, name: string) =>
  t(`admin.users.roleNames.${name.toLowerCase().replace(/\s+/g, "_")}`, { defaultValue: name });

/**
 * Change a user's role or school from the admin panel. Both backend routes already existed
 * (audited: USER_UPDATE with before/after, USER_LINK_SCHOOL) with no UI calling them, so the
 * only way to do either was SQL against production.
 */
export function UserAccessEditor({
  user,
  onChanged,
}: {
  user: { id: string; name: string; role: string };
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(false);

  const [schoolOpen, setSchoolOpen] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [savingSchool, setSavingSchool] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRolesLoading(true);
    getActiveRoles()
      .then((r) => { if (!cancelled) setRoles(r); })
      .catch(() => { if (!cancelled) setRoles([]); })
      .finally(() => { if (!cancelled) setRolesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!schoolOpen || schools.length > 0) return;
    let cancelled = false;
    setSchoolsLoading(true);
    getSchools({ limit: 50 })
      .then((res) => { if (!cancelled) setSchools(res?.data ?? []); })
      .catch(() => { if (!cancelled) toast.error(t("admin.users.invite.school.loadFailed")); })
      .finally(() => { if (!cancelled) setSchoolsLoading(false); });
    return () => { cancelled = true; };
  }, [schoolOpen, schools.length, t]);

  // Only what PUT /admin/users/:id/role accepts. Super Admin is never offered, even to a Super
  // Admin: platform power is granted by an audited SQL step, not a dropdown.
  const assignableRoles = useMemo(
    () => roles.filter((r) => (ASSIGNABLE_ROLES as readonly string[]).includes(r.name.toLowerCase())),
    [roles],
  );
  const currentRole = roles.find((r) => r.name.toLowerCase() === (user.role || "").toLowerCase());

  const visibleSchools = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    return q ? schools.filter((s) => s.name?.toLowerCase().includes(q)) : schools;
  }, [schools, schoolQuery]);

  const changeRole = async (roleId: string) => {
    const next = roles.find((r) => r.id === roleId);
    if (!next || next.id === currentRole?.id) return;
    const ok = await confirm({
      title: t("admin.users.access.roleConfirmTitle"),
      description: t("admin.users.access.roleConfirmBody", {
        name: user.name,
        from: roleLabel(t, user.role || "—"),
        to: roleLabel(t, next.name),
      }),
      confirmLabel: t("admin.users.access.roleConfirmCta"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    setSavingRole(true);
    try {
      await updateUserRole(user.id, next.name.toLowerCase());
      toast.success(t("admin.users.access.roleChanged", { name: user.name, role: roleLabel(t, next.name) }));
      onChanged();
    } catch {
      toast.error(t("admin.users.access.roleFailed"));
    } finally {
      setSavingRole(false);
    }
  };

  const moveToSchool = async (school: School) => {
    const ok = await confirm({
      title: t("admin.users.access.schoolConfirmTitle"),
      description: t("admin.users.access.schoolConfirmBody", { name: user.name, school: school.name }),
      confirmLabel: t("admin.users.access.schoolConfirmCta"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    setSavingSchool(true);
    try {
      await linkUserToSchool(user.id, school.id);
      toast.success(t("admin.users.access.schoolChanged", { name: user.name, school: school.name }));
      setSchoolOpen(false);
      onChanged();
    } catch {
      toast.error(t("admin.users.access.schoolFailed"));
    } finally {
      setSavingSchool(false);
    }
  };

  return (
    <div className="border-t border-gray-100 p-4 space-y-4" data-testid="user-access-editor">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("admin.users.access.heading")}</p>

      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700" htmlFor="user-role-select">
          <ShieldCheck className="h-4 w-4 text-gray-400" /> {t("admin.users.access.role")}
        </label>
        <Select
          value={currentRole?.id ?? ""}
          onValueChange={changeRole}
          disabled={rolesLoading || savingRole || assignableRoles.length === 0}
        >
          <SelectTrigger id="user-role-select" aria-label={t("admin.users.access.role")} className="h-10 rounded-lg">
            <SelectValue placeholder={rolesLoading ? t("admin.users.access.loadingRoles") : roleLabel(t, user.role || "—")} />
          </SelectTrigger>
          <SelectContent>
            {assignableRoles.map((r) => (
              <SelectItem key={r.id} value={r.id}>{roleLabel(t, r.name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-400">{t("admin.users.access.roleHint")}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Building2 className="h-4 w-4 text-gray-400" /> {t("admin.users.access.school")}
          </span>
          <button
            type="button"
            onClick={() => setSchoolOpen((v) => !v)}
            className="text-xs font-medium underline"
            style={{ color: "var(--admin-accent-blue)" }}
          >
            {schoolOpen ? t("common.cancel") : t("admin.users.access.changeSchool")}
          </button>
        </div>
        {schoolOpen && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={schoolQuery}
                onChange={(e) => setSchoolQuery(e.target.value)}
                placeholder={t("admin.users.invite.school.searchPlaceholder")}
                aria-label={t("admin.users.invite.school.searchPlaceholder")}
                className="h-10 rounded-lg pl-9"
              />
            </div>
            {schoolsLoading ? (
              <p className="py-3 text-center text-xs text-gray-400">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> {t("admin.users.invite.school.loading")}
              </p>
            ) : visibleSchools.length === 0 ? (
              <p className="py-3 text-center text-xs text-gray-400">{t("admin.users.invite.school.noResults")}</p>
            ) : (
              <div className="max-h-48 overflow-y-auto grid gap-1">
                {visibleSchools.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={savingSchool}
                    onClick={() => moveToSchool(s)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <Building2 className="h-4 w-4 text-gray-400" /> {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog />
    </div>
  );
}
