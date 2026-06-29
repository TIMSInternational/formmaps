"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Mail } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function CoachAccessDenied() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="mx-auto bg-red-100 p-3 rounded-full w-fit mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-700">{t("coach:accessDenied.title")}</CardTitle>
          <CardDescription className="text-lg">
            {t("coach:accessDenied.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-gray-600">
            {t("coach:accessDenied.body")}
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <p>
              {t("coach:accessDenied.note")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href="mailto:support@timcare.com">
                <Mail className="mr-2 h-4 w-4" />
                {t("coach:accessDenied.contactSupport")}
              </Link>
            </Button>
            <Button variant="outline" asChild className="w-full">
              <Link href="/">
                {t("coach:accessDenied.returnHome")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
