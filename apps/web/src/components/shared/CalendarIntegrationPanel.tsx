"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useGlobalStore } from "@/store/useGlobalStore";
import { getCalendarAuthUrl, checkCalendarAuthStatus, disconnectCalendar } from "@/services/calendarService";

export function CalendarIntegrationPanel() {
  const { user } = useGlobalStore();
  const [isLoading, setIsLoading] = useState(true);
  const [calendarConnection, setCalendarConnection] = useState<{
    connected: boolean;
    provider: "google" | "outlook" | null;
    email?: string;
  }>({ connected: false, provider: null });
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);

  useEffect(() => {
    const checkCalendarStatus = async () => {
      if (!user?.email) return;
      try {
        // Check Google
        const googleStatus = await checkCalendarAuthStatus(
          "google",
          user.email
        ).catch(() => null);
        if (googleStatus?.authDetails?.connected) {
          setCalendarConnection({
            connected: true,
            provider: "google",
            email: googleStatus.email,
          });
          setIsLoading(false);
          return;
        }

        // Check Outlook
        const outlookStatus = await checkCalendarAuthStatus(
          "outlook",
          user.email
        ).catch(() => null);
        if (outlookStatus?.authDetails?.connected) {
          setCalendarConnection({
            connected: true,
            provider: "outlook",
            email: outlookStatus.email,
          });
        }
      } catch (e) {
        console.warn("Failed to check calendar status", e);
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.id) {
      checkCalendarStatus();
    }
  }, [user?.id, user?.email]);

  const handleConnectCalendar = async (provider: "google" | "outlook") => {
    try {
      setIsConnectingCalendar(true);
      const { url } = await getCalendarAuthUrl(
        provider,
        user?.email || undefined,
        window.location.href
      );
      window.location.href = url;
    } catch (error) {
      console.error("Failed to initiate calendar connection:", error);
      toast.error(`Failed to connect to ${provider}`);
      setIsConnectingCalendar(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!calendarConnection.provider) return;

    try {
      setIsConnectingCalendar(true);
      await disconnectCalendar(calendarConnection.provider, user?.email || undefined);

      setCalendarConnection({ connected: false, provider: null });
      toast.success("Calendar disconnected successfully");
    } catch (error) {
      console.error("Failed to disconnect calendar:", error);
      toast.error("Failed to disconnect calendar");
    } finally {
      setIsConnectingCalendar(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium text-black mb-1">Calendar Integration</h3>
          <p className="text-sm text-gray-400">Loading calendar settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-white mb-1">
          Calendar Integration
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Connect your Google or Microsoft calendar to automatically sync events and manage your schedule.
        </p>
      </div>

      <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 overflow-hidden max-w-2xl">
        <div className="p-4 sm:p-6 space-y-4">
          {calendarConnection.connected ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-green-900/10 border border-green-900/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-900/30 flex items-center justify-center flex-shrink-0">
                  <Check className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-400 capitalize">
                    {calendarConnection.provider} Calendar Connected
                  </p>
                  {calendarConnection.email && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {calendarConnection.email}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border-red-500/20"
                onClick={handleDisconnectCalendar}
                disabled={isConnectingCalendar}
              >
                {isConnectingCalendar ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col p-4 border border-gray-700/50 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Google Calendar</h4>
                    <p className="text-xs text-gray-400">Sync with Google</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-[#4285F4] hover:bg-[#3367D6] text-white"
                  onClick={() => handleConnectCalendar("google")}
                  disabled={isConnectingCalendar}
                >
                  {isConnectingCalendar ? "Connecting..." : "Connect Google"}
                </Button>
              </div>

              <div className="flex flex-col p-4 border border-gray-700/50 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[#0078D4] flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Outlook Calendar</h4>
                    <p className="text-xs text-gray-400">Sync with Microsoft</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-[#0078D4] hover:bg-[#006CBE] text-white"
                  onClick={() => handleConnectCalendar("outlook")}
                  disabled={isConnectingCalendar}
                >
                  {isConnectingCalendar ? "Connecting..." : "Connect Outlook"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
