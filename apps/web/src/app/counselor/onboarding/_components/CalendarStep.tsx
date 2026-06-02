"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { CheckCircle2, Calendar } from "lucide-react";
import { getCalendarAuthUrl } from "@/services/calendarService";
import { toast } from "sonner";

interface CalendarStepProps {
  onboardedEmail: string | null;
  onGoToDashboard: () => void;
}

export function CalendarStep({ onboardedEmail, onGoToDashboard }: CalendarStepProps) {
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [connectedProvider, setConnectedProvider] = useState<"google" | "outlook" | null>(null);

  const handleConnectCalendar = async (provider: "google" | "outlook") => {
    try {
      setIsConnectingCalendar(true);
      const email = onboardedEmail ?? undefined;
      const { url } = await getCalendarAuthUrl(provider, email, window.location.href);
      window.location.href = url;
    } catch {
      toast.error("Failed to start calendar connection. You can connect later in Settings.");
      setIsConnectingCalendar(false);
    }
  };

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
                onClick={onGoToDashboard}
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
