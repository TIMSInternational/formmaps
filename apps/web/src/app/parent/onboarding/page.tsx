"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Heart,
  School,
  User,
  Users,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useVerifyParentToken, useCompleteParentOnboarding } from "@/hooks/useParentPortalQueries";
import { useGlobalStore } from "@/store/useGlobalStore";

const RELATIONSHIP_LABELS: Record<string, string> = {
  mother: "Mother",
  father: "Father",
  sibling: "Sibling",
  guardian: "Guardian",
  other: "Guardian / Other",
};

function ParentOnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const { setUser } = useGlobalStore();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const {
    data: tokenData,
    isLoading: verifying,
    isError: tokenInvalid,
    error: tokenError,
  } = useVerifyParentToken(token);

  const complete = useCompleteParentOnboarding();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    complete.mutate(
      {
        token,
        password,
        name: name.trim(),
      },
      {
        onSuccess: (result) => {
          // Backend set auth cookies; mirror login so the Bearer fallback + store are in sync.
          setUser({
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.roleName,
            accessToken: result.token,
            permissions: result.user.permissions,
            isAuthenticated: true,
          });
          setDone(true);
          setTimeout(() => router.push("/parent"), 2000);
        },
        onError: (err: Error) =>
          toast.error(err.message || "Account setup failed. Please try again."),
      }
    );
  };

  // No token
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="pt-10 pb-8 text-center">
            <AlertTriangle className="h-12 w-12 text-orange-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Invalid Invitation Link
            </h2>
            <p className="text-gray-500 text-sm">
              This invitation link is missing a token. Please check the email
              you received or contact your school.
            </p>
            <Link href="/login" className="mt-6 inline-block">
              <Button variant="outline">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verifying
  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="space-y-4 text-center">
          <Loader2 className="h-10 w-10 text-violet-500 mx-auto animate-spin" />
          <p className="text-gray-500">Verifying your invitation…</p>
        </div>
      </div>
    );
  }

  // Token invalid or expired
  if (tokenInvalid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="pt-10 pb-8 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Invitation Expired or Invalid
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {(tokenError as Error)?.message ??
                "This invitation link has expired or is no longer valid. Please contact the school for a new invitation."}
            </p>
            <Link href="/login">
              <Button variant="outline">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="max-w-md w-full border-0 shadow-xl text-center">
            <CardContent className="pt-10 pb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
              >
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Welcome!
              </h2>
              <p className="text-gray-500 text-sm">
                Your parent account is ready. Redirecting to your portal…
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <Heart className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Set Up Your Parent Portal Account
          </h1>
          <p className="text-gray-500 text-sm">
            You've been invited to track your child's academic journey
          </p>
        </div>

        {/* Invite Details */}
        {tokenData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border border-violet-100 shadow-md bg-violet-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-violet-500" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                        Student
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        {tokenData.studentName}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-violet-500" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                        Your Role
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        {RELATIONSHIP_LABELS[tokenData.relationship] ??
                          tokenData.relationship}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <School className="h-4 w-4 text-violet-500" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                        School
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        {tokenData.schoolName}
                      </p>
                    </div>
                  </div>

                  <Badge className="self-center bg-violet-100 text-violet-700 border-violet-200">
                    {tokenData.email}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Form */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Create your account</CardTitle>
            <CardDescription>
              Set up your credentials to access the parent portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">
                  Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm">
                  Confirm Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500">
                    Passwords do not match
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={
                  complete.isPending ||
                  !name.trim() ||
                  !password ||
                  !confirmPassword ||
                  password !== confirmPassword
                }
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white h-11 mt-2"
              >
                {complete.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Activate My Account
              </Button>

              <p className="text-xs text-center text-gray-400 pt-1">
                Already have an account?{" "}
                <Link href="/login" className="text-violet-600 hover:underline">
                  Sign in here
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function ParentOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
        </div>
      }
    >
      <ParentOnboardingContent />
    </Suspense>
  );
}
