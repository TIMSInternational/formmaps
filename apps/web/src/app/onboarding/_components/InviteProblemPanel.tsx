"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Clock, Loader2, MailCheck } from "lucide-react";
import { resendInvite } from "@/services/studentOnboardingService";
import { classifyResendError, type InviteProblem } from "@/lib/auth/authErrors";

type ResendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; sentTo: string; expiresAt: string }
  | { kind: "rate_limited" }
  | { kind: "failed" };

/**
 * What an invitee sees when their link can't be used — one state per reason, each with its
 * own way forward. Before this every reason collapsed into "Invalid Invitation" with a single
 * "Back to Login" button, which an invitee (who has no password yet) cannot use.
 */
export function InviteProblemPanel({ token, problem: initial }: { token: string; problem: InviteProblem }) {
  const { t, i18n } = useTranslation();
  const [problem, setProblem] = useState<InviteProblem>(initial);
  const [resend, setResend] = useState<ResendState>({ kind: "idle" });

  const requestNewLink = async () => {
    setResend({ kind: "sending" });
    try {
      const { sentTo, expiresAt } = await resendInvite(token);
      setResend({ kind: "sent", sentTo, expiresAt });
    } catch (err) {
      const why = classifyResendError(err);
      if (why === "used") { setProblem("used"); setResend({ kind: "idle" }); return; }
      if (why === "invalid") { setProblem("invalid"); setResend({ kind: "idle" }); return; }
      setResend({ kind: why === "rate_limited" ? "rate_limited" : "failed" });
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString(i18n.language || undefined, { day: "numeric", month: "long", year: "numeric" });
  };

  const primaryButton = "w-full h-11 rounded-lg text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60";

  if (problem === "expired") {
    if (resend.kind === "sent") {
      const date = formatDate(resend.expiresAt);
      return (
        <Shell icon={<MailCheck className="w-7 h-7" style={{ color: "#1B6B44" }} />} tone="ok" testId="invite-problem-sent">
          <h2 className="text-xl font-semibold mb-2" style={{ color: "#111" }}>{t("onboarding.invite.problem.sentHeading")}</h2>
          <p className="text-sm mb-2" style={{ color: "#555" }}>
            {date
              ? t("onboarding.invite.problem.sentBody", { email: resend.sentTo, date })
              : t("onboarding.invite.problem.sentBodyNoDate", { email: resend.sentTo })}
          </p>
          <p className="text-xs" style={{ color: "#777" }}>{t("onboarding.invite.problem.sentSpamHint")}</p>
        </Shell>
      );
    }
    return (
      <Shell icon={<Clock className="w-7 h-7" style={{ color: "#A84C05" }} />} tone="warn" testId="invite-problem-expired">
        <h2 className="text-xl font-semibold mb-2" style={{ color: "#111" }}>{t("onboarding.invite.problem.expiredHeading")}</h2>
        <p className="text-sm mb-6" style={{ color: "#555" }}>{t("onboarding.invite.problem.expiredBody")}</p>
        <button
          type="button"
          onClick={requestNewLink}
          disabled={resend.kind === "sending"}
          className={primaryButton}
          style={{ background: "#102B47" }}
        >
          {resend.kind === "sending"
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("onboarding.invite.problem.sending")}</>
            : t("onboarding.invite.problem.sendNewLink")}
        </button>
        {resend.kind === "rate_limited" && (
          <p role="alert" className="text-xs mt-3" style={{ color: "#A84C05" }}>{t("onboarding.invite.problem.rateLimited")}</p>
        )}
        {resend.kind === "failed" && (
          <p role="alert" className="text-xs mt-3" style={{ color: "#B3261E" }}>{t("onboarding.invite.problem.resendFailed")}</p>
        )}
        <p className="text-xs mt-5" style={{ color: "#777" }}>{t("onboarding.invite.problem.askSchool")}</p>
      </Shell>
    );
  }

  if (problem === "used") {
    return (
      <Shell icon={<CheckCircle2 className="w-7 h-7" style={{ color: "#1B6B44" }} />} tone="ok" testId="invite-problem-used">
        <h2 className="text-xl font-semibold mb-2" style={{ color: "#111" }}>{t("onboarding.invite.problem.usedHeading")}</h2>
        <p className="text-sm mb-6" style={{ color: "#555" }}>{t("onboarding.invite.problem.usedBody")}</p>
        <Link href="/login" className={primaryButton} style={{ background: "#102B47" }}>
          {t("onboarding.invite.problem.signIn")}
        </Link>
        <Link href="/forgot-password" className="block text-xs mt-4 underline" style={{ color: "var(--admin-accent-blue)" }}>
          {t("onboarding.invite.problem.forgotPassword")}
        </Link>
      </Shell>
    );
  }

  if (problem === "invalid") {
    return (
      <Shell icon={<AlertCircle className="w-7 h-7 text-red-500" />} tone="error" testId="invite-problem-invalid">
        <h2 className="text-xl font-semibold mb-2" style={{ color: "#111" }}>{t("onboarding.invite.problem.invalidHeading")}</h2>
        <p className="text-sm mb-6" style={{ color: "#555" }}>{t("onboarding.invite.problem.invalidBody")}</p>
        <Link href="/login" className="block text-xs underline" style={{ color: "var(--admin-accent-blue)" }}>
          {t("onboarding.invite.problem.haveAccount")}
        </Link>
      </Shell>
    );
  }

  return (
    <Shell icon={<AlertCircle className="w-7 h-7 text-red-500" />} tone="error" testId="invite-problem-unknown">
      <h2 className="text-xl font-semibold mb-2" style={{ color: "#111" }}>{t("onboarding.invite.problem.unknownHeading")}</h2>
      <p className="text-sm mb-6" style={{ color: "#555" }}>{t("onboarding.invite.problem.unknownBody")}</p>
      <button type="button" onClick={() => window.location.reload()} className={primaryButton} style={{ background: "#102B47" }}>
        {t("onboarding.invite.problem.tryAgain")}
      </button>
    </Shell>
  );
}

function Shell({
  icon, tone, testId, children,
}: { icon: React.ReactNode; tone: "ok" | "warn" | "error"; testId: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  const ring = tone === "ok" ? "#E7F3EC" : tone === "warn" ? "#FDF1E4" : "#FEF2F2";
  return (
    <div className="min-h-screen flex" style={{ background: "#FFFFFF" }} data-testid={testId}>
      <div className="hidden lg:flex lg:w-[48%] items-center justify-center" style={{ background: "#102B47" }}>
        <div className="px-16">
          <div className="flex items-center gap-3 mb-8">
            <img src="/fm-icon.png" alt="FormMaps" className="h-12 w-auto" style={{ filter: "brightness(0) invert(1)" }} />
            <div>
              <span className="text-2xl font-bold text-white">FORM</span>
              <span className="text-2xl font-bold" style={{ color: "#FFD23F" }}>MAPS</span>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight">
            {t("onboarding.invite.problem.brandLine1")}<br />
            <span style={{ color: "#FFD23F" }}>{t("onboarding.invite.problem.brandLine2")}</span>
          </h2>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: ring }}>
            {icon}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
