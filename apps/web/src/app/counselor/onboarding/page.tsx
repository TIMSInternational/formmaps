"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Compass,
  UserCheck,
  Users,
  School,
  Loader2,
  Calendar,
} from "lucide-react";
import { getCalendarAuthUrl, checkCalendarAuthStatus } from "@/services/calendarService";
import { toast } from "sonner";
import { useVerifyCounselorToken, useCompleteCounselorOnboarding } from "@/hooks/useCounselorOnboarding";
import { useGlobalStore } from "@/store/useGlobalStore";

const TIMEZONES = [
  "America/Costa_Rica",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Madrid",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const { setUser } = useGlobalStore();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [showCalendarStep, setShowCalendarStep] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [connectedProvider, setConnectedProvider] = useState<"google" | "outlook" | null>(null);
  const [onboardedEmail, setOnboardedEmail] = useState<string | null>(null);

  const { data: tokenData, isLoading: verifying, isError: tokenInvalid, error: tokenError } =
    useVerifyCounselorToken(token);

  const complete = useCompleteCounselorOnboarding();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Full name is required");
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
        phone: phone || undefined,
        timezone: timezone || undefined,
      },
      {
        onSuccess: (result) => {
          // Store JWT and user info
          if (typeof window !== "undefined") {
            localStorage.setItem("token", result.token);
          }
          setUser(result.user as any);
          // Show calendar step before final redirect
          const email = (result.user as any)?.email ?? tokenData?.email ?? null;
          setOnboardedEmail(email);
          setShowCalendarStep(true);
        },
        onError: (err: Error) => toast.error(err.message || "Onboarding failed. Please try again."),
      }
    );
  };

  const handleConnectCalendar = async (provider: "google" | "outlook") => {
    try {
      setIsConnectingCalendar(true);
      const email = onboardedEmail ?? undefined;
      const { url } = await getCalendarAuthUrl(provider, email, window.location.href);
      window.location.href = url;
    } catch (err) {
      console.error("Calendar connect failed:", err);
      toast.error("Failed to start calendar connection. You can connect later in Settings.");
      setIsConnectingCalendar(false);
    }
  };

  const handleGoToDashboard = () => {
    setDone(true);
    router.push("/counselor");
  };

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="pt-10 pb-8 text-center">
            <AlertTriangle className="h-12 w-12 text-orange-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation Link</h2>
            <p className="text-gray-500 text-sm">This invitation link is missing a token. Please check the email you received and try again, or contact your school administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verifying token
  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
        <div className="space-y-4 text-center">
          <Loader2 className="h-10 w-10 text-indigo-500 mx-auto animate-spin" />
          <p className="text-gray-500">Verifying your invitation…</p>
        </div>
      </div>
    );
  }

  // Token invalid
  if (tokenInvalid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="pt-10 pb-8 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invitation Expired or Invalid</h2>
            <p className="text-gray-500 text-sm mb-6">
              {(tokenError as Error)?.message ?? "This invitation link has expired or is no longer valid. Please contact your school administrator for a new invitation."}
            </p>
            <Link href="/login">
              <Button variant="outline">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calendar connection step
  if (showCalendarStep && !done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg space-y-6"
        >
          <div className="text-center space-y-2">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }}>
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            </motion.div>
            <h1 className="text-2xl font-bold text-gray-900">Account Created!</h1>
            <p className="text-gray-500 text-sm">Connect your calendar to sync events and stay organized — or skip and do it later in Settings.</p>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-500" />
                Connect Your Calendar
              </CardTitle>
              <CardDescription>Optional — you can always connect it later from Settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {calendarConnected ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 capitalize">{connectedProvider} Calendar Connected!</p>
                    <p className="text-xs text-gray-500">Your calendar will sync with your counselor dashboard.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => handleConnectCalendar("google")}
                    disabled={isConnectingCalendar}
                    className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-indigo-300 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 bg-white rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Google Calendar</p>
                      <p className="text-xs text-gray-500">Sync with Google</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleConnectCalendar("outlook")}
                    disabled={isConnectingCalendar}
                    className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-indigo-300 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 bg-[#0078D4] rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Calendar className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Outlook Calendar</p>
                      <p className="text-xs text-gray-500">Sync with Microsoft</p>
                    </div>
                  </button>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={handleGoToDashboard}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-slate-700 hover:from-indigo-700 hover:to-slate-800 text-white"
                >
                  {calendarConnected ? "Go to Dashboard" : "Skip for Now"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Final done state (rarely shown since we redirect immediately)
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="max-w-md w-full border-0 shadow-xl text-center">
            <CardContent className="pt-10 pb-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}>
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome aboard!</h2>
              <p className="text-gray-500 text-sm">Your counselor account is ready. Redirecting to your dashboard…</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-slate-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <Compass className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set Up Your Counselor Account</h1>
          <p className="text-gray-500 text-sm">You&apos;ve been invited to join as a counselor on UNIV.365</p>
        </div>

        {/* Invite Info */}
        {tokenData && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border border-indigo-100 shadow-md bg-indigo-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <School className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">School</p>
                      <p className="text-sm font-semibold text-gray-800">{tokenData.schoolName ?? "Your School"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Invited by</p>
                      <p className="text-sm font-semibold text-gray-800">{tokenData.invitedBy}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Students</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {tokenData.assignAll ? "All students" : `${tokenData.assignedStudentCount} assigned`}
                      </p>
                    </div>
                  </div>
                  <Badge className="self-center bg-indigo-100 text-indigo-700 border-indigo-200">
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
            <CardDescription>Set a secure password to get started</CardDescription>
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
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              {/* Optional Profile */}
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Optional Profile Details</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                disabled={complete.isPending || !name.trim() || !password || !confirmPassword || password !== confirmPassword}
                className="w-full bg-gradient-to-r from-indigo-600 to-slate-700 hover:from-indigo-700 hover:to-slate-800 text-white h-11 mt-2"
              >
                {complete.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Complete Setup
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function CounselorOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
