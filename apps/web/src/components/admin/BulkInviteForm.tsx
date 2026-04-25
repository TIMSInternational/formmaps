"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload, FileDown, CheckCircle, XCircle } from "lucide-react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";

interface CoachData {
  fullName: string;
  email: string;
  contractStart?: string;
  contractEnd?: string;
  platformCommission?: string | number;
}

export function BulkInviteForm() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResults(null);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "fullName,email,contractStart,contractEnd,platformCommission\nJohn Doe,john@example.com,2024-01-01,2024-12-31,15\nJane Smith,jane@example.com,2024-02-01,2025-01-31,20";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "coach_invite_template.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsLoading(true);
    setResults(null);

    Papa.parse<CoachData>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const validData = results.data.filter(row => row.email && row.fullName);

        if (validData.length === 0) {
          toast.error(t('admin.invite.noValidRows'));
          setIsLoading(false);
          return;
        }

        try {
          const { signupCoachBulk } = await import("@/services/coachService");
          // Transform CSV data to match API expectation
          const coachesToInvite = validData.map(row => ({
            email: row.email,
            fullName: row.fullName,
            password: generatePassword(),
            contractStart: row.contractStart,
            contractEnd: row.contractEnd,
            platformCommission: row.platformCommission ? Number(row.platformCommission) : undefined,
          }));

          const response = await signupCoachBulk(coachesToInvite);

          // Assuming response contains results
          const data = response;

          const successCount = Array.isArray(data) ? data.filter((r: any) => r.success).length : coachesToInvite.length;
          const failedCount = Array.isArray(data) ? data.filter((r: any) => !r.success).length : 0;
          const errors = Array.isArray(data) ? data.filter((r: any) => !r.success).map((r: any) => r.error || "Unknown error") : [];

          setResults({
            success: successCount,
            failed: failedCount,
            errors: errors
          });

          toast.success(t('admin.invite.processedRecords', { count: coachesToInvite.length }));

          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          setFile(null);

        } catch (error: any) {
          toast.error(error.message || t('admin.invite.bulkProcessFailed'));
        } finally {
          setIsLoading(false);
        }
      },
      error: (error) => {
        toast.error(error.message);
        setIsLoading(false);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {t('admin.invite.bulkTitle')}
        </CardTitle>
        <CardDescription>
          {t('admin.invite.bulkDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('admin.invite.csvTemplateTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('admin.invite.csvTemplateDescription')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileDown className="mr-2 h-4 w-4" />
              {t('admin.invite.downloadTemplate')}
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csvFile">{t('admin.invite.uploadCSV')}</Label>
              <Input
                ref={fileInputRef}
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                required
                aria-describedby="csv-hint"
              />
              <p id="csv-hint" className="text-xs text-muted-foreground">{t('admin.invite.csvAcceptedFormat')}</p>
            </div>
            <Button type="submit" disabled={isLoading || !file} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('admin.invite.processing')}
                </>
              ) : (
                t('admin.invite.processBulkInvite')
              )}
            </Button>
          </form>

          {results && (
            <div className="space-y-2 pt-4 border-t">
              <h4 className="text-sm font-medium">{t('admin.invite.resultsTitle')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">{t('admin.invite.results.success', { count: results.success })}</span>
                </div>
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm">{t('admin.invite.results.failed', { count: results.failed })}</span>
                </div>
              </div>
              {results.errors.length > 0 && (
                <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-600 max-h-32 overflow-y-auto">
                  <p className="font-medium mb-1">{t('admin.invite.errorsTitle')}</p>
                  <ul className="list-disc pl-4 space-y-1">
                    {results.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
