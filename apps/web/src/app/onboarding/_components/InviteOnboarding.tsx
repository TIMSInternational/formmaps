"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  verifyStudentToken,
  completeStudentOnboarding,
} from "@/services/studentOnboardingService";
import { Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Illustration } from "@/components/illustration/Illustration";
import { classifyInviteError, type InviteProblem } from "@/lib/auth/authErrors";
import { normalizeRole, roleHomeMap } from "@/lib/roleUtils";
import { PASSWORD_RULES, firstPasswordProblem, passwordProblemKey, passwordRuleLabelKey } from "@/lib/auth/passwordPolicy";
import { InviteProblemPanel } from "./InviteProblemPanel";

const makePasswordSchema = (t: TFunction) =>
  z
    .object({
      // The server's exact rule (passwordPolicy.ts), so the form never accepts a password the
      // server then rejects after "Activate" — the special character used to be missing here.
      password: z.string().superRefine((value, ctx) => {
        const broken = firstPasswordProblem(value);
        if (broken) ctx.addIssue({ code: "custom", message: t(passwordProblemKey(broken)) });
      }),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("onboarding.student.validation.passwordsMatch"),
      path: ["confirmPassword"],
    });

type PasswordFormData = z.infer<ReturnType<typeof makePasswordSchema>>;

/**
 * Accepting an invite consumes its token on the server, so checking the token again afterwards
 * says "not valid". Remember, for this browser session, that THIS person just accepted it: if the
 * page mounts again (Back button, a reload before the redirect lands) it shows the activated state
 * and moves on instead of a dead-link error.
 */
const acceptedKey = (token: string) => `invite-accepted:${token}`;
function readAccepted(token: string): string | null {
  try { return window.sessionStorage.getItem(acceptedKey(token)); } catch { return null; }
}
function rememberAccepted(token: string, home: string) {
  try { window.sessionStorage.setItem(acceptedKey(token), home); } catch { /* private mode: best effort */ }
}

/**
 * The invite onboarding flow, shared by two routes.
 *
 * The onboarding token is role-agnostic on the server — the same token is
 * issued to students by the school-admin invite and to counselors and school
 * admins by the platform-admin invite — so one screen serves all three and
 * reads the role off the token. `/onboarding/student/[token]` stays mounted for
 * links already sitting in inboxes; `/onboarding/invite/[token]` is what new
 * invites use, because a counselor should not receive a URL that says
 * "student".
 */
export function InviteOnboarding({ token }: { token: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { setUser } = useGlobalStore();
  const passwordSchema = useMemo(() => makePasswordSchema(t), [t]);

  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [userId, setUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<string | null>(null);
  const [inviteSchool, setInviteSchool] = useState<string | null>(null);
  const [problem, setProblem] = useState<InviteProblem>("invalid");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once the server accepted the invite: where we are taking them (their role's home).
  const [activatedHome, setActivatedHome] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { handleSubmit, control, formState: { errors } } = form;

  useEffect(() => {
    const acceptedHome = readAccepted(token);
    if (acceptedHome) {
      // Accepted in this session already — never re-check a token we consumed ourselves; just
      // finish the trip to their home.
      setActivatedHome(acceptedHome);
      setIsLoading(false);
      router.replace(acceptedHome);
      return;
    }
    const checkToken = async () => {
      try {
        setIsLoading(true);
        const result = await verifyStudentToken(token);
        const isValidToken = result.isValid === true || result.isValid === "true";
        if (isValidToken) {
          setIsValid(true);
          setStudentName(result.student?.name || t("onboarding.student.nameFallback"));
          setUserId(result.student?.id || "");
          setInviteRole(result.roleName ?? null);
          setInviteSchool(result.schoolName ?? null);
        } else {
          setIsValid(false);
          setProblem(result.problem ?? "invalid");
        }
      } catch {
        setIsValid(false);
        setProblem("unknown");
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, [token]);

  const onSubmit = async (data: PasswordFormData) => {
    setIsSubmitting(true);
    try {
      if (!userId) throw new Error(t("onboarding.student.idNotFound"));
      const result = await completeStudentOnboarding(token, data.password, data.confirmPassword, userId);
      if (result.success) {
        if (result.token) {
          const role = result.user.role?.name || result.user.roleName;
          // Straight to their own home — a counselor or school admin sent to /dashboard only
          // bounced through another redirect.
          const home = roleHomeMap[normalizeRole(role)] ?? "/dashboard";
          rememberAccepted(token, home);
          setActivatedHome(home);
          setUser({
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role,
            accessToken: result.token,
            isAuthenticated: true,
          });
          router.replace(home);
        } else {
          rememberAccepted(token, "/login");
          setActivatedHome("/login");
          toast.success(t("onboarding.student.activatedLogin"));
          router.replace("/login");
        }
      } else {
        throw new Error(result.message || t("onboarding.student.activationFailed"));
      }
    } catch (err: unknown) {
      // The invite can lapse (or be accepted in another tab) while this form is open: show
      // that state and its way forward rather than a raw server message in a toast.
      // A bare 400 here is a form problem (e.g. password rules), not a dead invite — only a
      // coded or 404/409/410 answer switches screens.
      const status = (err as { status?: number }).status;
      const why = (err as { code?: string }).code || status === 404 || status === 409 || status === 410
        ? classifyInviteError(err)
        : "unknown";
      if (why !== "unknown") {
        setProblem(why);
        setIsValid(false);
      } else {
        toast.error(status === 400 && (err as Error).message ? (err as Error).message : t("onboarding.student.activationError"));
      }
      setIsSubmitting(false);
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex" style={{ background: "#FFFFFF" }}>
        <div className="hidden lg:flex lg:w-[48%]" style={{ background: "#102B47" }} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            <Skeleton className="h-10 w-10 mx-auto rounded-lg" />
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // Accepted: say so while their home loads — never fall back to the form or a link error.
  if (activatedHome) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#FFFFFF" }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: "#10B981" }} />
          <h1 className="text-2xl font-semibold mb-2" style={{ color: "#102B47" }}>
            {t("onboarding.student.activatedTitle")}
          </h1>
          <p className="text-sm flex items-center justify-center gap-2" style={{ color: "#666" }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            {activatedHome === "/login" ? t("onboarding.student.activatedLogin") : t("onboarding.student.activatedTakingYou")}
          </p>
          <a href={activatedHome} className="inline-block mt-6 text-sm font-medium" style={{ color: "var(--admin-accent-blue)" }}>
            {t("onboarding.student.activatedContinue")}
          </a>
        </motion.div>
      </div>
    );
  }

  // The link can't be used: one state per reason, each with its own way forward.
  if (!isValid) {
    return <InviteProblemPanel token={token} problem={problem} />;
  }

  // Form
  return (
    <div className="min-h-screen flex" style={{ background: "#FFFFFF" }}>
      {/* Left Panel — Branding */}
      <div
        className="hidden lg:flex lg:w-[48%] relative overflow-hidden"
        style={{ background: "#102B47" }}
      >
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col justify-center px-16 relative z-10"
        >
          <div className="flex items-center gap-3 mb-12">
            <img src="/fm-icon.png" alt="FormMaps" className="h-12 w-auto" style={{ filter: "brightness(0) invert(1)" }} />
            <div>
              <span className="text-2xl font-bold text-white tracking-tight">FORM</span>
              <span className="text-2xl font-bold tracking-tight" style={{ color: "#FFD23F" }}>MAPS</span>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            {t("onboarding.student.welcomeTo")}<br />
            {/* The school on the invite — this used to be a hardcoded "Country Day School." */}
            <span style={{ color: "#FFD23F" }}>{inviteSchool || "FormMaps"}.</span>
          </h1>
          <p className="text-base mb-10" style={{ color: "rgba(255,255,255,0.75)", maxWidth: 420, lineHeight: 1.7 }}>
            {t("onboarding.student.subtitle")}
          </p>

          <div className="flex flex-col gap-4">
            {[
              t("onboarding.student.bullet1"),
              t("onboarding.student.bullet2"),
              t("onboarding.student.bullet3"),
              t("onboarding.student.bullet4"),
            ].map((text, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#FFD23F" }} />
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full" style={{ background: "rgba(255,214,0,0.08)" }} />
        <Illustration
          name="welcome"
          size={260}
          className="absolute bottom-10 right-10 z-0 opacity-90 pointer-events-none hidden lg:block"
        />
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-10">
            <img src="/fm-icon.png" alt="FormMaps" className="h-10 w-auto" />
            <div>
              <span className="text-xl font-bold" style={{ color: "#102B47" }}>FORM</span>
              <span className="text-xl font-bold" style={{ color: "var(--admin-accent-blue)" }}>MAPS</span>
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold mb-2" style={{ color: "#102B47" }}>
              {t("onboarding.student.welcomeUser", { name: studentName.split(" ")[0] })}
            </h1>
            <p className="text-sm" style={{ color: "#666" }}>
              {t("onboarding.student.createPassword")}
            </p>
            {inviteSchool && (
              <p className="text-sm mt-2 font-medium" style={{ color: "var(--admin-accent-blue)" }}>
                {t("onboarding.invite.context", {
                  school: inviteSchool,
                  role: t(`admin.users.invite.roles.${inviteRole}.label`, { defaultValue: inviteRole ?? "" }),
                })}
              </p>
            )}
          </div>

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
              <FormField
                control={control}
                name="password"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-medium" style={{ color: "#333" }}>
                      {t("onboarding.student.passwordLabel")}
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder={t("onboarding.student.passwordPlaceholder")}
                          {...field}
                          className="h-11 px-3 pr-10 text-sm rounded-lg border outline-none transition-colors w-full"
                          style={{ background: "#F8F9FA", borderColor: errors.password ? "#dc2626" : "#E0E0E0", color: "#111" }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--admin-accent-blue)"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = errors.password ? "#dc2626" : "#E0E0E0"; }}
                        />
                      </FormControl>
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#999" }}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-medium" style={{ color: "#333" }}>
                      {t("onboarding.student.confirmLabel")}
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder={t("onboarding.student.confirmPlaceholder")}
                          {...field}
                          className="h-11 px-3 pr-10 text-sm rounded-lg border outline-none transition-colors w-full"
                          style={{ background: "#F8F9FA", borderColor: errors.confirmPassword ? "#dc2626" : "#E0E0E0", color: "#111" }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--admin-accent-blue)"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = errors.confirmPassword ? "#dc2626" : "#E0E0E0"; }}
                        />
                      </FormControl>
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#999" }}>
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password requirements hint */}
              <div className="text-[11px] space-y-1" style={{ color: "#999" }}>
                <p>{t("onboarding.student.requirements")}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {PASSWORD_RULES.map(({ rule }) => (
                    <span key={rule}>• {t(passwordRuleLabelKey(rule))}</span>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-lg text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "#102B47" }}
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t("onboarding.student.activating")}</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> {t("onboarding.student.activateAccount")}</>
                )}
              </button>
            </form>
          </Form>

          <p className="text-center mt-6 text-xs" style={{ color: "#999" }}>
            {t("onboarding.student.alreadyHaveAccount")}{" "}
            <a href="/login" className="font-medium" style={{ color: "var(--admin-accent-blue)" }}>{t("onboarding.student.signIn")}</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
