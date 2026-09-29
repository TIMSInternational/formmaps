"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Calendar, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getCalendarAuthUrl,
  getCalendarStatus,
  disconnectCalendar,
  type CalendarProviderName,
  type CalendarStatus,
} from "@/services/calendarService";
import { useTranslation } from "react-i18next";

const EMPTY: CalendarStatus = { configured: false, connected: false, email: null, connectedAt: null };
const PROVIDER_NAMES: Record<CalendarProviderName, string> = { google: "Google", outlook: "Outlook" };

export function CalendarIntegrationPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<Record<CalendarProviderName, CalendarStatus>>({
    google: EMPTY,
    outlook: EMPTY,
  });

  const refresh = useCallback(async () => {
    const [google, outlook] = await Promise.all([getCalendarStatus("google"), getCalendarStatus("outlook")]);
    setStatus({ google, outlook });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // OAuth return: ?calendar=connected|error — toast, refetch, strip the param.
  useEffect(() => {
    const result = searchParams.get("calendar");
    if (!result) return;
    if (result === "connected") toast.success(t("calendarIntegration.connectedToast"));
    else toast.error(t("calendarIntegration.connectFailedToast"));
    refresh();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("calendar");
    router.replace(params.size ? `${pathname}?${params}` : pathname);
  }, [searchParams, pathname, router, refresh, t]);

  const handleConnect = async (provider: CalendarProviderName) => {
    try {
      setIsBusy(true);
      const res = await getCalendarAuthUrl(provider);
      if (!res.configured || !res.url) {
        toast.error(t("coach:settings.calendar.notConfigured"));
        setIsBusy(false);
        return;
      }
      window.location.href = res.url;
    } catch {
      toast.error(t("calendarIntegration.connectProviderFailed", { provider: PROVIDER_NAMES[provider] }));
      setIsBusy(false);
    }
  };

  const handleDisconnect = async (provider: CalendarProviderName) => {
    try {
      setIsBusy(true);
      await disconnectCalendar(provider);
      toast.success(t("calendarIntegration.disconnectedToast"));
      await refresh();
    } catch {
      toast.error(t("coach:settings.calendar.disconnectError"));
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">{t("calendarIntegration.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("calendarIntegration.loading")}</p>
        </div>
      </div>
    );
  }

  const configured = status.google.configured || status.outlook.configured;
  const connectedProvider = (["google", "outlook"] as CalendarProviderName[]).find((p) => status[p].connected);
  // connected:false but an email on record = previous connection whose refresh failed.
  const staleProvider = (["google", "outlook"] as CalendarProviderName[]).find(
    (p) => !status[p].connected && status[p].email,
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">{t("calendarIntegration.title")}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("calendarIntegration.description")}
        </p>
      </div>

      <div className="max-w-2xl">
        {!configured ? (
          <p className="text-xs text-muted-foreground p-4 border border-dashed rounded-xl" data-testid="calendar-not-configured">
            {t("coach:settings.calendar.notConfigured")}
          </p>
        ) : connectedProvider ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-600">
                  {t("calendarIntegration.connectedTitle", { provider: PROVIDER_NAMES[connectedProvider] })}
                </p>
                {status[connectedProvider].email && (
                  <p className="text-xs text-muted-foreground mt-0.5">{status[connectedProvider].email}</p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20"
              onClick={() => handleDisconnect(connectedProvider)}
              disabled={isBusy}
            >
              {isBusy ? t("calendarIntegration.disconnecting") : t("calendarIntegration.disconnect")}
            </Button>
          </div>
        ) : staleProvider ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-600">
                  {t("calendarIntegration.expiredTitle", { provider: PROVIDER_NAMES[staleProvider] })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {status[staleProvider].email
                    ? t("calendarIntegration.reconnectHintEmail", { email: status[staleProvider].email })
                    : t("calendarIntegration.reconnectHint")}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => handleConnect(staleProvider)} disabled={isBusy}>
              {isBusy ? t("calendarIntegration.connecting") : t("calendarIntegration.reconnect")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="dash-card p-4 flex flex-col hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-white border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground">{t("onboarding.calendar.google")}</h4>
                  <p className="text-[11px] text-muted-foreground">{t("calendarIntegration.syncGoogle")}</p>
                </div>
              </div>
              <Button
                className="w-full bg-[#4285F4] hover:bg-[#3367D6] text-white mt-auto"
                size="sm"
                onClick={() => handleConnect("google")}
                disabled={isBusy}
              >
                {isBusy ? t("calendarIntegration.connecting") : t("calendarIntegration.connectGoogle")}
              </Button>
            </div>

            <div className="dash-card p-4 flex flex-col hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#0078D4]/10 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-[#0078D4]" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground">{t("onboarding.calendar.outlook")}</h4>
                  <p className="text-[11px] text-muted-foreground">{t("calendarIntegration.syncMicrosoft")}</p>
                </div>
              </div>
              <Button
                className="w-full bg-[#0078D4] hover:bg-[#006CBE] text-white mt-auto"
                size="sm"
                onClick={() => handleConnect("outlook")}
                disabled={isBusy}
              >
                {isBusy ? t("calendarIntegration.connecting") : t("calendarIntegration.connectOutlook")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
