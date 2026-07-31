"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { AuthBrandingPanel } from "@/components/auth/AuthBrandingPanel";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "";

type Step = "email" | "reset" | "success";

// Shared light input styling (matches login/signup).
const inputClass =
  "h-11 px-3 text-sm rounded-lg border outline-none transition-colors w-full";
const inputStyle: React.CSSProperties = {
  background: "#F8F9FA",
  borderColor: "#E0E0E0",
  color: "#111",
};
const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = "#2E9098";
};
const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = "#E0E0E0";
};

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  const [step, setStep] = useState<Step>(tokenFromUrl ? "reset" : "email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(tokenFromUrl || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      setStep("reset");
    }
  }, [tokenFromUrl]);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`${API}/authapi/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || t("auth.forgotPassword.errSendFailed")); return; }
      setSent(true);
    } catch {
      setError(t("auth.forgotPassword.errNetwork"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t("auth.forgotPassword.errMismatch"));
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API}/authapi/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || t("auth.forgotPassword.errResetFailed")); return; }
      setStep("success");
    } catch {
      setError(t("auth.forgotPassword.errNetwork"));
    } finally {
      setIsLoading(false);
    }
  };

  const submitButton = (label: string, busyLabel: string) => (
    <button
      type="submit"
      disabled={isLoading}
      className="h-11 rounded-lg border-none text-sm font-semibold cursor-pointer transition-all w-full"
      style={{ background: "#102B47", color: "#FFFFFF", opacity: isLoading ? 0.6 : 1 }}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          {busyLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );

  return (
    <div className="min-h-dvh flex" style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
      {/* Left Panel — Branding (shared with login/signup) */}
      <AuthBrandingPanel />

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12" style={{ background: "#FFFFFF" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fm-icon.png" alt="FormMaps" className="h-10 w-auto" />
            <div>
              <span className="text-xl font-bold" style={{ color: "#102B47" }}>FORM</span>
              <span className="text-xl font-bold" style={{ color: "#2E9098" }}>MAPS</span>
            </div>
          </div>

          {step === "email" && !sent && (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold mb-2" style={{ color: "#102B47" }}>
                  {t("auth.forgotPassword.resetTitle")}
                </h1>
                <p className="text-sm" style={{ color: "#666" }}>{t("auth.forgotPassword.resetSubtitle")}</p>
              </div>

              <form onSubmit={handleSendLink} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium" style={{ color: "#333" }}>
                    {t("auth.forgotPassword.emailLabel")}
                  </label>
                  <input
                    type="email"
                    placeholder={t("auth.forgotPassword.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClass}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                {submitButton(t("auth.forgotPassword.sendLink"), t("auth.forgotPassword.sending"))}
              </form>
            </>
          )}

          {step === "email" && sent && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-12 h-12" style={{ color: "#059669" }} />
              </div>
              <h1 className="text-2xl font-semibold mb-2" style={{ color: "#102B47" }}>
                {t("auth.forgotPassword.checkEmailTitle")}
              </h1>
              <p className="text-sm mb-8" style={{ color: "#666" }}>
                {t("auth.forgotPassword.checkEmailBefore")}{" "}
                <span style={{ color: "#102B47", fontWeight: 500 }}>{email}</span>
                {t("auth.forgotPassword.checkEmailAfter")}
              </p>
              <button
                onClick={() => { setSent(false); setError(null); }}
                className="text-sm cursor-pointer bg-transparent border-none"
                style={{ color: "#2E9098", fontWeight: 500 }}
              >
                {t("auth.forgotPassword.tryAgainLink")}
              </button>
            </div>
          )}

          {step === "reset" && (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold mb-2" style={{ color: "#102B47" }}>
                  {t("auth.forgotPassword.setNewTitle")}
                </h1>
                <p className="text-sm" style={{ color: "#666" }}>{t("auth.forgotPassword.setNewSubtitle")}</p>
              </div>

              <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium" style={{ color: "#333" }}>
                    {t("auth.forgotPassword.newPasswordLabel")}
                  </label>
                  <input
                    type="password"
                    placeholder={t("auth.forgotPassword.newPasswordPlaceholder")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className={inputClass}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium" style={{ color: "#333" }}>
                    {t("auth.forgotPassword.confirmNewLabel")}
                  </label>
                  <input
                    type="password"
                    placeholder={t("auth.forgotPassword.confirmNewPlaceholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className={inputClass}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                {submitButton(t("auth.forgotPassword.resetButton"), t("auth.forgotPassword.resetting"))}
              </form>
            </>
          )}

          {step === "success" && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-12 h-12" style={{ color: "#059669" }} />
              </div>
              <h1 className="text-2xl font-semibold mb-2" style={{ color: "#102B47" }}>
                {t("auth.forgotPassword.successTitle")}
              </h1>
              <p className="text-sm mb-8" style={{ color: "#666" }}>{t("auth.forgotPassword.successText")}</p>
              <button
                onClick={() => router.push("/login")}
                className="h-11 rounded-lg border-none text-sm font-semibold cursor-pointer transition-all w-full"
                style={{ background: "#102B47", color: "#FFFFFF" }}
              >
                {t("auth.forgotPassword.backToLogin")}
              </button>
            </div>
          )}

          {step !== "success" && !sent && (
            <p className="mt-8 text-center text-sm" style={{ color: "#666" }}>
              <Link
                href="/login"
                className="font-medium no-underline inline-flex items-center gap-1"
                style={{ color: "#2E9098" }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t("auth.forgotPassword.backToLogin")}
              </Link>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
