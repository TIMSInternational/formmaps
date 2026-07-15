"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertTriangle, Eye, EyeOff, Compass, UserCheck, Users, School, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useVerifyCounselorToken, useCompleteCounselorOnboarding } from "@/hooks/useCounselorOnboarding";
import { useGlobalStore } from "@/store/useGlobalStore";
import { CalendarStep } from "./_components/CalendarStep";

const TIMEZONES = [
  "America/Costa_Rica", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Madrid", "Asia/Tokyo",
  "Asia/Singapore", "Australia/Sydney",
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
  const [onboardedEmail, setOnboardedEmail] = useState<string | null>(null);

  const { data: tokenData, isLoading: verifying, isError: tokenInvalid, error: tokenError } =
    useVerifyCounselorToken(token);

  const complete = useCompleteCounselorOnboarding();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Full name is required"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }

    complete.mutate(
      { token, password, name: name.trim(), phone: phone || undefined, timezone: timezone || undefined },
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
          const email = result.user?.email ?? tokenData?.email ?? null;
          setOnboardedEmail(email);
          setShowCalendarStep(true);
        },
        onError: (err: Error) => toast.error(err.message || "Onboarding failed. Please try again."),
      }
    );
  };

  const handleGoToDashboard = () => { setDone(true); router.push("/counselor"); };

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
            <Link href="/login"><Button variant="outline">Go to Login</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showCalendarStep && !done) {
    return <CalendarStep onboardedEmail={onboardedEmail} onGoToDashboard={handleGoToDashboard} />;
  }

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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-slate-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <Compass className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set Up Your Counselor Account</h1>
          <p className="text-gray-500 text-sm">You&apos;ve been invited to join as a counselor on UNIV.365</p>
        </div>

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
                  <Badge className="self-center bg-indigo-100 text-indigo-700 border-indigo-200">{tokenData.email}</Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Create your account</CardTitle>
            <CardDescription>Set a secure password to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                <Input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input id="confirm" type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your password" required className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowConfirm((v) => !v)}>
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && <p className="text-xs text-red-500">Passwords do not match</p>}
              </div>
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Optional Profile Details</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone"><SelectValue placeholder="Select timezone" /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={complete.isPending || !name.trim() || !password || !confirmPassword || password !== confirmPassword}
                className="w-full bg-gradient-to-r from-indigo-600 to-slate-700 hover:from-indigo-700 hover:to-slate-800 text-white h-11 mt-2">
                {complete.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
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
