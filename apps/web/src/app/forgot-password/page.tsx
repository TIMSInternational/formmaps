"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cognitoForgotPassword, cognitoConfirmPassword } from "@/lib/cognito";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

type Step = "email" | "code" | "success";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await cognitoForgotPassword(email);
      setStep("code");
    } catch (err: any) {
      setError(err.message || "Failed to send reset code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);
    try {
      await cognitoConfirmPassword(email, code, newPassword);
      setStep("success");
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    height: 40,
    padding: "0 12px",
    fontSize: 13,
    background: "#1e1e1e",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    color: "#ebebeb",
    outline: "none",
    width: "100%",
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1d1d1d",
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
        padding: "48px 24px",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ width: "100%", maxWidth: 400 }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #8b5a6b, #4a3040)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            N
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#ebebeb" }}>
            Nexa Univ
          </span>
        </div>

        {step === "email" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#ebebeb",
                  marginBottom: 8,
                }}
              >
                Reset your password
              </h1>
              <p style={{ fontSize: 13, color: "#818181" }}>
                Enter your email and we will send you a verification code.
              </p>
            </div>

            <form
              onSubmit={handleSendCode}
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <label
                  style={{ fontSize: 12, fontWeight: 500, color: "#b3b3b3" }}
                >
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#555";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#2a2a2a";
                  }}
                />
              </div>

              {error && (
                <p style={{ fontSize: 12, color: "#ef4444" }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  height: 40,
                  borderRadius: 6,
                  border: "none",
                  background: "#ebebeb",
                  color: "#171717",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: isLoading ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {isLoading ? "Sending..." : "Send reset code"}
              </button>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#ebebeb",
                  marginBottom: 8,
                }}
              >
                Enter verification code
              </h1>
              <p style={{ fontSize: 13, color: "#818181" }}>
                We sent a code to{" "}
                <span style={{ color: "#b3b3b3" }}>{email}</span>. Check your
                inbox.
              </p>
            </div>

            <form
              onSubmit={handleResetPassword}
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <label
                  style={{ fontSize: 12, fontWeight: 500, color: "#b3b3b3" }}
                >
                  Verification code
                </label>
                <input
                  type="text"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#555";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#2a2a2a";
                  }}
                />
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <label
                  style={{ fontSize: 12, fontWeight: 500, color: "#b3b3b3" }}
                >
                  New password
                </label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#555";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#2a2a2a";
                  }}
                />
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <label
                  style={{ fontSize: 12, fontWeight: 500, color: "#b3b3b3" }}
                >
                  Confirm new password
                </label>
                <input
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#555";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#2a2a2a";
                  }}
                />
              </div>

              {error && (
                <p style={{ fontSize: 12, color: "#ef4444" }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  height: 40,
                  borderRadius: 6,
                  border: "none",
                  background: "#ebebeb",
                  color: "#171717",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: isLoading ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {isLoading ? "Resetting..." : "Reset password"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("email");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#818181",
                  fontSize: 12,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                Didn&apos;t receive a code? Go back and try again
              </button>
            </form>
          </>
        )}

        {step === "success" && (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <CheckCircle2
                style={{ width: 48, height: 48, color: "#22c55e" }}
              />
            </div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "#ebebeb",
                marginBottom: 8,
              }}
            >
              Password reset successful
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "#818181",
                marginBottom: 32,
              }}
            >
              Your password has been updated. You can now sign in with your new
              password.
            </p>
            <button
              onClick={() => router.push("/login")}
              style={{
                height: 40,
                borderRadius: 6,
                border: "none",
                background: "#ebebeb",
                color: "#171717",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Back to login
            </button>
          </div>
        )}

        {step !== "success" && (
          <p
            style={{
              marginTop: 32,
              textAlign: "center",
              fontSize: 13,
              color: "#818181",
            }}
          >
            <Link
              href="/login"
              style={{
                color: "#ebebeb",
                fontWeight: 500,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              Back to login
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}
