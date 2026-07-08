"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

interface CalendarConnection {
  connected: boolean;
  provider: "google" | "outlook" | null;
  email?: string;
}

interface CalendarIntegrationSectionProps {
  calendarConnection: CalendarConnection;
  isConnectingCalendar: boolean;
  onConnect: (provider: "google" | "outlook") => void;
  onDisconnect: () => void;
}

export function CalendarIntegrationSection({
  calendarConnection,
  isConnectingCalendar,
  onConnect,
  onDisconnect,
}: CalendarIntegrationSectionProps) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#2E9098]" />
            Calendar Integration
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Sync your availability with your external calendar to avoid double
            bookings.
          </p>
        </div>
        {calendarConnection.connected && (
          <Badge
            variant="secondary"
            className="bg-emerald-50 text-emerald-700 border-emerald-200"
          >
            Connected to{" "}
            {calendarConnection.provider === "google"
              ? "Google Calendar"
              : "Outlook"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Google Calendar */}
        <div
          className={`border rounded-xl p-4 flex items-center justify-between transition-all ${calendarConnection.provider === "google"
            ? "border-emerald-200 bg-emerald-50/30"
            : calendarConnection.connected
              ? "border-gray-100 opacity-50 bg-gray-50"
              : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center border border-gray-100">
              <span className="font-bold text-lg text-blue-500">G</span>
            </div>
            <div>
              <p className="font-medium text-gray-900">Google Calendar</p>
              <p className="text-xs text-gray-500">
                Connect your Gmail calendar
              </p>
            </div>
          </div>
          <div>
            {calendarConnection.provider === "google" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onDisconnect}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConnect("google")}
                disabled={
                  isConnectingCalendar || calendarConnection.connected
                }
              >
                Connect
              </Button>
            )}
          </div>
        </div>

        {/* Outlook Calendar */}
        <div
          className={`border rounded-xl p-4 flex items-center justify-between transition-all ${calendarConnection.provider === "outlook"
            ? "border-blue-200 bg-blue-50/30"
            : calendarConnection.connected
              ? "border-gray-100 opacity-50 bg-gray-50"
              : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center border border-gray-100">
              <span className="font-bold text-lg text-blue-700">M</span>
            </div>
            <div>
              <p className="font-medium text-gray-900">Outlook Calendar</p>
              <p className="text-xs text-gray-500">
                Connect your Microsoft calendar
              </p>
            </div>
          </div>
          <div>
            {calendarConnection.provider === "outlook" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onDisconnect}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConnect("outlook")}
                disabled={
                  isConnectingCalendar || calendarConnection.connected
                }
              >
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
