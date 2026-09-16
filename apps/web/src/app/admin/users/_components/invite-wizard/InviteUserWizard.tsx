"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Mail,
  MailWarning,
  Search,
  Send,
  ShieldCheck,
  UserCog,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getSchools } from "@/services/schoolService";
import type { School } from "@/types/school";
import {
  InviteError,
  inviteUser,
  type InvitableRole,
  type InviteUserResult,
} from "@/services/adminUsersService";
import { StepIndicator } from "./StepIndicator";

interface InviteUserWizardProps {
  onInvited: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only students consume a school's seat allowance; staff do not. */
const CONSUMES_SEAT: Record<InvitableRole, boolean> = {
  student: true,
  counselor: false,
  school_admin: false,
};

const ROLE_ICON: Record<InvitableRole, typeof GraduationCap> = {
  student: GraduationCap,
  counselor: UserCog,
  school_admin: ShieldCheck,
};

const ROLE_ORDER: InvitableRole[] = ["student", "counselor", "school_admin"];

export function InviteUserWizard({ onInvited }: InviteUserWizardProps) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("student");
  const [schoolId, setSchoolId] = useState("");

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InviteUserResult | null>(null);
  const [error, setError] = useState<InviteError | null>(null);

  const stepLabels = [
    t("admin.users.invite.steps.person"),
    t("admin.users.invite.steps.school"),
    t("admin.users.invite.steps.review"),
    t("admin.users.invite.steps.result"),
  ];

  const reset = useCallback(() => {
    setStep(0);
    setName("");
    setEmail("");
    setRole("student");
    setSchoolId("");
    setSchoolQuery("");
    setResult(null);
    setError(null);
    setSubmitting(false);
  }, []);

  // Schools are only needed once the dialog is open — no cost on page load.
  useEffect(() => {
    if (!open || schools.length > 0) return;
    let cancelled = false;
    setSchoolsLoading(true);
    getSchools({ limit: 50 })
      .then((res) => {
        if (!cancelled) setSchools(res?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("admin.users.invite.school.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setSchoolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, schools.length, t]);

  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === schoolId) ?? null,
    [schools, schoolId],
  );

  const visibleSchools = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.adminEmail ?? "").toLowerCase().includes(q),
    );
  }, [schools, schoolQuery]);

  const seatsFor = useCallback((school: School) => {
    const used = school.studentCount ?? 0;
    const max = school.maxStudents ?? 0;
    return { used, max, full: max > 0 && used >= max };
  }, []);

  /**
   * A full school only blocks a STUDENT. Mirrors the server, which checks the
   * seat cap for students alone — staff never consume a seat.
   */
  const schoolBlocked = useCallback(
    (school: School) => CONSUMES_SEAT[role] && seatsFor(school).full,
    [role, seatsFor],
  );

  const emailValid = EMAIL_RE.test(email.trim());
  const personValid = name.trim().length > 0 && emailValid;
  const schoolValid = Boolean(selectedSchool) && !(selectedSchool && schoolBlocked(selectedSchool));

  const handleSend = async () => {
    if (!selectedSchool) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await inviteUser({
        email: email.trim(),
        name: name.trim(),
        role,
        schoolId: selectedSchool.id,
      });
      setResult(res);
      setStep(3);
      onInvited();
    } catch (err) {
      setError(err instanceof InviteError ? err : new InviteError("UNKNOWN", String(err)));
      setStep(3);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-10 rounded-xl border-gray-200 bg-white text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-900 hover:shadow-md"
        >
          <Mail className="mr-2 h-4 w-4" />
          {t("admin.users.invite.trigger")}
        </Button>
      </DialogTrigger>

      <DialogContent className="overflow-hidden rounded-2xl border-gray-100 p-0 shadow-2xl sm:max-w-[560px]">
        <DialogHeader className="flex flex-col items-center border-b border-gray-100 bg-gray-50/50 p-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#2E9098]/10 text-[#2E9098] shadow-sm ring-4 ring-white">
            <UserPlus className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-gray-900">
            {t("admin.users.invite.title")}
          </DialogTitle>
          <DialogDescription className="mt-1 max-w-[380px] text-gray-500">
            {t("admin.users.invite.description")}
          </DialogDescription>
          <div className="mt-5 w-full">
            <StepIndicator current={step} labels={stepLabels} />
          </div>
        </DialogHeader>

        <div className="max-h-[46vh] overflow-y-auto p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name" className="ml-1 text-sm font-semibold text-gray-700">
                  {t("admin.users.invite.person.nameLabel")}
                </Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("admin.users.invite.person.namePlaceholder")}
                  className="h-11 rounded-xl border-gray-200 transition-all focus:border-[#2E9098] focus:ring-[#2E9098]/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-email" className="ml-1 text-sm font-semibold text-gray-700">
                  {t("admin.users.invite.person.emailLabel")}
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("admin.users.invite.person.emailPlaceholder")}
                  aria-invalid={email.length > 0 && !emailValid}
                  className="h-11 rounded-xl border-gray-200 transition-all focus:border-[#2E9098] focus:ring-[#2E9098]/20"
                />
                {email.length > 0 && !emailValid && (
                  <p className="ml-1 text-xs text-red-500">
                    {t("admin.users.invite.person.emailInvalid")}
                  </p>
                )}
              </div>

              <fieldset className="space-y-2">
                <legend className="ml-1 mb-2 text-sm font-semibold text-gray-700">
                  {t("admin.users.invite.person.roleLabel")}
                </legend>
                <div className="grid gap-2">
                  {ROLE_ORDER.map((r) => {
                    const Icon = ROLE_ICON[r];
                    const active = role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        aria-pressed={active}
                        className={[
                          "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                          active
                            ? "border-[#2E9098] bg-[#2E9098]/5 ring-1 ring-[#2E9098]/20"
                            : "border-gray-200 bg-white hover:border-gray-300",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            active ? "bg-[#2E9098] text-white" : "bg-gray-100 text-gray-500",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-gray-900">
                            {t(`admin.users.invite.roles.${r}.label`)}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {t(`admin.users.invite.roles.${r}.description`)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={schoolQuery}
                  onChange={(e) => setSchoolQuery(e.target.value)}
                  placeholder={t("admin.users.invite.school.searchPlaceholder")}
                  className="h-11 rounded-xl border-gray-200 pl-9 transition-all focus:border-[#2E9098] focus:ring-[#2E9098]/20"
                />
              </div>

              {schoolsLoading && (
                <p className="py-6 text-center text-sm text-gray-400">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  {t("admin.users.invite.school.loading")}
                </p>
              )}

              {!schoolsLoading && visibleSchools.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">
                  {t("admin.users.invite.school.noResults")}
                </p>
              )}

              <div className="grid gap-2">
                {visibleSchools.map((school) => {
                  const { used, max, full } = seatsFor(school);
                  const blocked = schoolBlocked(school);
                  const active = schoolId === school.id;
                  return (
                    <button
                      key={school.id}
                      type="button"
                      disabled={blocked}
                      onClick={() => setSchoolId(school.id)}
                      aria-pressed={active}
                      className={[
                        "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                        blocked
                          ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
                          : active
                            ? "border-[#2E9098] bg-[#2E9098]/5 ring-1 ring-[#2E9098]/20"
                            : "border-gray-200 bg-white hover:border-gray-300",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-[#2E9098] text-white" : "bg-gray-100 text-gray-500",
                        ].join(" ")}
                      >
                        <Building2 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-900">
                          {school.name}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {school.adminEmail}
                        </span>
                        <span
                          className={[
                            "mt-1 inline-block text-[11px] font-medium",
                            full ? "text-amber-600" : "text-gray-400",
                          ].join(" ")}
                        >
                          {t("admin.users.invite.school.seats", { used, max })}
                          {blocked ? ` — ${t("admin.users.invite.school.full")}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {!CONSUMES_SEAT[role] && (
                <p className="ml-1 text-xs text-gray-400">
                  {t("admin.users.invite.school.staffNoSeat")}
                </p>
              )}
            </div>
          )}

          {step === 2 && selectedSchool && (
            <div className="space-y-4">
              <dl className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                <ReviewRow label={t("admin.users.invite.review.person")} value={name.trim()} sub={email.trim()} />
                <ReviewRow
                  label={t("admin.users.invite.review.role")}
                  value={t(`admin.users.invite.roles.${role}.label`)}
                />
                <ReviewRow
                  label={t("admin.users.invite.review.school")}
                  value={selectedSchool.name}
                  sub={selectedSchool.adminEmail}
                />
              </dl>
              <div className="flex items-start gap-2 rounded-xl bg-[#2E9098]/5 p-3 text-xs text-gray-600">
                <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2E9098]" />
                <p>{t("admin.users.invite.review.emailNote", { email: email.trim() })}</p>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-4 text-center">
              <div
                className={[
                  "mx-auto flex h-12 w-12 items-center justify-center rounded-full",
                  result.emailSent ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
                ].join(" ")}
              >
                {result.emailSent ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <MailWarning className="h-6 w-6" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-gray-900">
                  {result.action === "resent"
                    ? t("admin.users.invite.result.resentTitle")
                    : t("admin.users.invite.result.createdTitle")}
                </p>
                <p className="text-sm text-gray-500">
                  {t("admin.users.invite.result.summary", {
                    name: result.name,
                    role: t(`admin.users.invite.roles.${result.role}.label`),
                    school: result.schoolName,
                  })}
                </p>
              </div>
              {result.emailSent ? (
                <p className="text-xs text-gray-400">
                  {t("admin.users.invite.result.emailSent", { email: result.email })}
                </p>
              ) : (
                <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                  {t("admin.users.invite.result.emailFailed", { email: result.email })}
                </p>
              )}
            </div>
          )}

          {step === 3 && error && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-gray-900">
                  {t("admin.users.invite.result.failedTitle")}
                </p>
                <p className="text-sm text-gray-500">{error.message}</p>
              </div>
              {error.code === "EMAIL_ALREADY_ACTIVE" && (
                <p className="rounded-xl bg-gray-50 p-3 text-left text-xs text-gray-600">
                  {t("admin.users.invite.result.alreadyActiveHint")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 p-6">
          {step < 3 ? (
            <>
              <Button
                variant="outline"
                onClick={() => (step === 0 ? handleOpenChange(false) : setStep(step - 1))}
                disabled={submitting}
                className="h-11 rounded-xl border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-white hover:text-gray-900"
              >
                {step === 0 ? (
                  t("common.cancel")
                ) : (
                  <>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t("admin.users.invite.back")}
                  </>
                )}
              </Button>

              {step < 2 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={step === 0 ? !personValid : !schoolValid}
                  className="h-11 min-w-[120px] rounded-xl bg-gray-900 text-white shadow-md hover:bg-gray-800"
                >
                  {t("admin.users.invite.next")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={submitting || !schoolValid || !personValid}
                  className="h-11 min-w-[140px] rounded-xl bg-gray-900 text-white shadow-md hover:bg-gray-800"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("admin.users.invite.sending")}
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      {t("admin.users.invite.send")}
                    </>
                  )}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={reset}
                className="h-11 rounded-xl border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-white hover:text-gray-900"
              >
                {t("admin.users.invite.inviteAnother")}
              </Button>
              <Button
                onClick={() => handleOpenChange(false)}
                className="h-11 min-w-[120px] rounded-xl bg-gray-900 text-white shadow-md hover:bg-gray-800"
              >
                {t("admin.users.invite.done")}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 bg-white px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="block truncate text-sm font-semibold text-gray-900">{value}</span>
        {sub && <span className="block truncate text-xs text-gray-500">{sub}</span>}
      </dd>
    </div>
  );
}
