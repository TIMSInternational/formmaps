"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, UserPlus, Users, FileUp, Download } from "lucide-react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import {
  useInviteStudent,
  useBulkInviteStudents,
} from "@/hooks/useSchoolAdmin";

interface StudentInviteFormProps {
  onSuccess?: () => void;
}

export function StudentInviteForm({ onSuccess }: StudentInviteFormProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("single");

  // Single invite state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Bulk invite state
  const [bulkData, setBulkData] = useState("");

  const inviteStudent = useInviteStudent();
  const bulkInviteStudents = useBulkInviteStudents();

  const handleSingleInvite = async () => {
    if (!email || !name) {
      toast.error(
        t(
          "schoolAdmin.invite.fillRequired",
          "Please fill in all required fields",
        ),
      );
      return;
    }

    try {
      await inviteStudent.mutateAsync({ email, name });
      toast.success(
        t("schoolAdmin.invite.success", `Invitation sent to ${name}`),
      );
      setName("");
      setEmail("");
      onSuccess?.();
    } catch (error: any) {
      toast.error(
        error.message ||
          t("schoolAdmin.invite.error", "Failed to send invitation"),
      );
    }
  };

  const handleBulkInvite = async () => {
    if (!bulkData.trim()) {
      toast.error(
        t("schoolAdmin.invite.enterBulkData", "Please enter student data"),
      );
      return;
    }

    // Parse bulk data (format: name,email per line)
    const lines = bulkData.trim().split("\n");
    const students = lines
      .map((line) => {
        const parts = line.split(",").map((s) => s.trim());
        return { name: parts[0] || "", email: parts[1] || "" };
      })
      .filter((s) => s.name && s.email);

    if (students.length === 0) {
      toast.error(
        t(
          "schoolAdmin.invite.invalidFormat",
          "Invalid format. Use: name,email (one per line)",
        ),
      );
      return;
    }

    try {
      const result = await bulkInviteStudents.mutateAsync({ students });
      toast.success(
        t(
          "schoolAdmin.invite.bulkSuccess",
          `Successfully invited ${result.invited} students`,
        ),
      );
      if (result.failed > 0) {
        toast.warning(`${result.failed} invitations failed`);
      }
      setBulkData("");
      onSuccess?.();
    } catch (error: any) {
      toast.error(
        error.message ||
          t("schoolAdmin.invite.bulkError", "Failed to send invitations"),
      );
    }
  };

  const handleDownloadSample = () => {
    const csvContent =
      "Name,Email\nJohn Doe,john@example.com\nJane Smith,jane@example.com";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "student_invite_sample.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const rows = results.data as string[][];
        let startIndex = 0;
        if (
          rows[0] &&
          rows[0].some(
            (cell: string) =>
              cell.toLowerCase().includes("email") ||
              cell.toLowerCase().includes("name"),
          )
        ) {
          startIndex = 1;
        }

        const formattedData = rows
          .slice(startIndex)
          .filter((row: string[]) => row.length >= 2 && row[0] && row[1])
          .map((row: string[]) => `${row[0]}, ${row[1]}`)
          .join("\n");

        if (formattedData) {
          setBulkData((prev) =>
            prev ? prev + "\n" + formattedData : formattedData,
          );
          toast.success(
            t("schoolAdmin.invite.csvImported", "CSV imported successfully"),
          );
        } else {
          toast.error(
            t("schoolAdmin.invite.csvEmpty", "No valid data found in CSV"),
          );
        }
      },
      header: false,
      skipEmptyLines: true,
    });
    e.target.value = "";
  };

  return (
    <Card className="border-0 shadow-none">
      <CardContent className="px-0 pt-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Single Invite
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Bulk Invite
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("common.name", "Name")}</Label>
              <Input
                id="name"
                type="text"
                placeholder={t(
                  "schoolAdmin.invite.namePlaceholder",
                  "John Doe",
                )}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email", "Email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t(
                  "schoolAdmin.invite.emailPlaceholder",
                  "student@email.com",
                )}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button
              onClick={handleSingleInvite}
              disabled={inviteStudent.isPending}
              className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700"
            >
              {inviteStudent.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.sending", "Sending...")}
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t("schoolAdmin.invite.sendInvite", "Send Invitation")}
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadSample}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {t("schoolAdmin.invite.downloadSample", "Download Sample CSV")}
              </Button>
              <div className="relative">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  id="csvUpload"
                />
                <Button variant="outline" size="sm" className="gap-2 w-full">
                  <FileUp className="h-4 w-4" />
                  {t("schoolAdmin.invite.uploadCSV", "Upload CSV")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkData">
                {t("schoolAdmin.invite.bulkLabel", "Student List")}
              </Label>
              <Textarea
                id="bulkData"
                placeholder={t(
                  "schoolAdmin.invite.bulkPlaceholder",
                  "John Doe, john@email.com\nJane Smith, jane@email.com",
                )}
                value={bulkData}
                onChange={(e) => setBulkData(e.target.value)}
                className="min-h-[150px] font-mono text-sm"
              />
              <p className="text-xs text-gray-500">
                {t(
                  "schoolAdmin.invite.bulkHint",
                  "Format: name, email (one student per line)",
                )}
              </p>
            </div>
            <Button
              onClick={handleBulkInvite}
              disabled={bulkInviteStudents.isPending}
              className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700"
            >
              {bulkInviteStudents.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.sending", "Sending...")}
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  {t(
                    "schoolAdmin.invite.sendBulkInvites",
                    "Send All Invitations",
                  )}
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
