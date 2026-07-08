import React from "react";
import { Button } from "@/components/ui/button";
import { CoachOnboardingData } from "./types";
import { Check, Calendar, Mail, ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface CalendarSyncStepProps {
  data: CoachOnboardingData["calendarIntegrations"];
  email: string;
  onNext: (data: CoachOnboardingData["calendarIntegrations"]) => void;
  onBack: () => void;
}

export function CalendarSyncStep({
  data,
  email,
  onNext,
  onBack,
}: CalendarSyncStepProps) {
  const { t } = useTranslation();
  const [integrations, setIntegrations] = React.useState(data);

  const handleConnect = async (provider: "google" | "outlook") => {
    try {
      const { getCalendarAuthUrl } = await import("@/services/calendarService");
      const res = await getCalendarAuthUrl(provider);
      if (!res.configured || !res.url) {
        alert(t("onboarding.calendar.notConfigured", { defaultValue: "Calendar sync isn't enabled on this server yet — you can connect later from Settings." }));
        return;
      }
      // URL comes from our own authenticated API (built from constants).
      window.location.href = res.url;
    } catch {
      // Never fake a connection on failure — the user can connect later in Settings.
      alert(t("onboarding.calendar.connectFailed", { defaultValue: "Failed to start the calendar connection. You can connect later from Settings." }));
    }
  };

  const handleSubmit = () => {
    onNext(integrations);
  };

  return (
    <div className="space-y-8">
      <div className="bg-green-50/50 p-6 rounded-xl border border-green-100 flex items-start gap-4">
        <div className="p-2 bg-green-100 rounded-lg text-green-600" aria-hidden="true">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-green-900 font-semibold">
            {t("onboarding.calendar.whyConnect", "Why connect your calendar?")}
          </h3>
          <p className="text-sm text-green-700/80 mt-1">
            {t("onboarding.calendar.whyConnectDesc", "We'll automatically check for conflicts so you never get double-booked. We only access your free/busy status, not your event details.")}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {/* Google Calendar */}
        <div
          className={cn(
            "relative group p-6 border rounded-2xl transition-all duration-300 flex items-center justify-between",
            integrations.google
              ? "border-[#2E9098]/30 bg-[#2E9098]/10 shadow-sm"
              : "border-gray-200 hover:border-gray-300 hover:shadow-md bg-white"
          )}
        >
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100 shrink-0">
              {/* Google Icon Placeholder */}
              <span className="font-bold text-blue-600 text-xl" aria-hidden="true">G</span>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-lg">
                {t("onboarding.calendar.google", "Google Calendar")}
              </h4>
              <p className="text-sm text-gray-500">
                {t("onboarding.calendar.googleDesc", "Connect your Gmail or G Suite calendar")}
              </p>
            </div>
          </div>
          <Button
            size="lg"
            disabled={integrations.outlook}
            variant={integrations.google ? "outline" : "default"}
            onClick={() => handleConnect("google")}
            className={cn(
              "min-w-[120px] transition-all",
              integrations.google
                ? "border-[#2E9098]/30 text-[#2E9098] hover:bg-[#2E9098]/10 hover:text-[#2E9098] bg-[#2E9098]/10"
                : "bg-black text-white hover:bg-gray-800"
            )}
            aria-label={integrations.google ? t("onboarding.calendar.googleConnected", "Google Calendar Connected") : t("onboarding.calendar.connectGoogle", "Connect Google Calendar")}
          >
            {integrations.google ? (
              <>
                <Check className="h-4 w-4 mr-2" aria-hidden="true" /> {t("onboarding.calendar.connected", "Connected")}
              </>
            ) : (
              t("onboarding.calendar.connect", "Connect")
            )}
          </Button>
        </div>

        {/* Outlook Calendar */}
        <div
          className={cn(
            "relative group p-6 border rounded-2xl transition-all duration-300 flex items-center justify-between",
            integrations.outlook
              ? "border-[#2E9098]/30 bg-[#2E9098]/10 shadow-sm"
              : "border-gray-200 hover:border-gray-300 hover:shadow-md bg-white",
            integrations.google && "opacity-50 pointer-events-none"
          )}
        >
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100 shrink-0">
              <Mail className="h-6 w-6 text-blue-500" aria-hidden="true" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-lg">
                {t("onboarding.calendar.outlook", "Outlook Calendar")}
              </h4>
              <p className="text-sm text-gray-500">
                {t("onboarding.calendar.outlookDesc", "Connect Office 365 or Exchange")}
              </p>
            </div>
          </div>
          <Button
            size="lg"
            variant={integrations.outlook ? "outline" : "default"}
            disabled={integrations.google}
            onClick={() => handleConnect("outlook")}
            className={cn(
              "min-w-[120px] transition-all",
              integrations.outlook
                ? "border-[#2E9098]/30 text-[#2E9098] hover:bg-[#2E9098]/10 hover:text-[#2E9098] bg-[#2E9098]/10"
                : "bg-black text-white hover:bg-gray-800"
            )}
            aria-label={integrations.outlook ? t("onboarding.calendar.outlookConnected", "Outlook Calendar Connected") : t("onboarding.calendar.connectOutlook", "Connect Outlook Calendar")}
          >
            {integrations.outlook ? (
              <>
                <Check className="h-4 w-4 mr-2" aria-hidden="true" /> {t("onboarding.calendar.connected", "Connected")}
              </>
            ) : (
              t("onboarding.calendar.connect", "Connect")
            )}
          </Button>
        </div>
      </div>

      <div className="flex justify-between pt-8 border-t border-gray-100">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-gray-500 hover:text-gray-900"
        >
          {t("common.back", "Back")}
        </Button>
        <Button
          onClick={handleSubmit}
          className="bg-black text-white hover:bg-gray-800 px-8 h-12 text-base shadow-lg shadow-black/10 hover:shadow-xl hover:-translate-y-0.5 transition-all"
        >
          {t("onboarding.calendar.completeSetup", "Complete Setup")} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
