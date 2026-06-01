"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "";

type Step = "email" | "reset" | "success";

export default function ForgotPasswordPage() {
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
      if (!res.ok) { setError(data.message || "Failed to send reset link"); return; }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
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

    setIsLoading(true);
    try {
      const res = await fetch(`${API}/authapi/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to reset password."); return; }
      setStep("success");
    } catch {
      setError("Network error. Please try again.");
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
              background: "#065292",
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
            FormMaps
          </span>
        </div>

        {step === "email" && !sent && (
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
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form
              onSubmit={handleSendLink}
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
                {isLoading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          </>
        )}

        {step === "email" && sent && (
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
              Check your email
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "#818181",
                marginBottom: 32,
              }}
            >
              If an account exists for <span style={{ color: "#b3b3b3" }}>{email}</span>, we&apos;ve sent a password reset link. Check your inbox.
            </p>
            <button
              onClick={() => { setSent(false); setError(null); }}
              style={{
                background: "transparent",
                border: "none",
                color: "#818181",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Didn&apos;t receive it? Try again
            </button>
          </div>
        )}

        {step === "reset" && (
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
                Set a new password
              </h1>
              <p style={{ fontSize: 13, color: "#818181" }}>
                Enter your new password below.
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

        {step !== "success" && !sent && (
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
