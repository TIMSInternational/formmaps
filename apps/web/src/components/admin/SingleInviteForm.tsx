"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail, Calendar as CalendarIcon, Edit } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { useTranslation } from "react-i18next";
import { Coach } from "@/types/coach";

interface SingleInviteFormProps {
  initialData?: Coach;
  onSuccess?: () => void;
}

export function SingleInviteForm({ initialData, onSuccess }: SingleInviteFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contractStart, setContractStart] = useState<Date>();
  const [contractEnd, setContractEnd] = useState<Date>();
  const [platformCommission, setPlatformCommission] = useState<number>(15); // Default 15%
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const isEditing = !!initialData;

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || initialData.fullName || "");
      setEmail(initialData.email || "");
      if (initialData.contractStart) setContractStart(new Date(initialData.contractStart));
      if (initialData.contractEnd) setContractEnd(new Date(initialData.contractEnd));
      if (typeof initialData.platformCommission === 'number') setPlatformCommission(initialData.platformCommission);
    }
  }, [initialData]);

  const handleSubmit = async () => {
    if (!email || !name) {
      toast.error(t("admin.invite.fillRequired", "Please fill in all required fields"));
      return;
    }

    setIsLoading(true);
    try {
      const { inviteCoach, updateCoach } = await import("@/services/coachService");

      const payload = {
        name,
        email,
        contractStart: contractStart ? format(contractStart, "yyyy-MM-dd") : undefined,
        contractEnd: contractEnd ? format(contractEnd, "yyyy-MM-dd") : undefined,
        platformCommission: Number(platformCommission),
      };

      if (isEditing && initialData) {
        await updateCoach(initialData.id, payload);
        toast.success(t("admin.coaches.updateSuccess", "Coach updated successfully"));
      } else {
        await inviteCoach(payload);
        toast.success(t("admin.invite.success", { name, email, defaultValue: `An invitation has been sent to ${name} (${email})` }));
      }

      if (onSuccess) {
        onSuccess();
      } else {
        // Reset only if not handling success externally (default behavior)
        if (!isEditing) {
          setName("");
          setEmail("");
          setContractStart(undefined);
          setContractEnd(undefined);
          setPlatformCommission(15);
        }
      }
    } catch (error) {
      toast.error(isEditing ? t("admin.coaches.updateError", "Failed to update coach") : t("admin.invite.error", "Failed to send invitation. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={cn(isEditing ? "border-0 shadow-none" : "py-4")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isEditing ? <Edit className="h-5 w-5" /> : <Mail className="h-5 w-5" aria-hidden="true" />}
          {isEditing ? t("admin.coaches.editTitle", "Edit Coach") : t("admin.invite.singleTitle", "Invite Single Coach")}
        </CardTitle>
        <CardDescription>
          {isEditing ? t("admin.coaches.editDescription", "Update coach details.") : t("admin.invite.singleDescription", "Send an email invitation to a new coach.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("admin.invite.fullName", "Full Name")}</Label>
            <Input
              id="name"
              type="text"
              placeholder={t("admin.invite.namePlaceholder", "John Doe")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("admin.invite.email", "Email Address")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('admin.invite.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isEditing}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 flex flex-col">
              <Label>{t("admin.invite.contractStart", "Contract Start Date")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !contractStart && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    {contractStart ? format(contractStart, "PPP") : <span>{t("common.pickDate", "Pick a date")}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={contractStart}
                    onSelect={setContractStart}
                    disabled={(date) =>
                      date < new Date(new Date().setHours(0, 0, 0, 0))
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2 flex flex-col">
              <Label>{t("admin.invite.contractEnd", "Contract End Date")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !contractEnd && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    {contractEnd ? format(contractEnd, "PPP") : <span>{t("common.pickDate", "Pick a date")}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={contractEnd}
                    onSelect={setContractEnd}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return date < (contractStart ?? today);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="commission">{t("admin.invite.platformCommission", "Platform Commission (%)")}</Label>
            <Input
              id="commission"
              type="number"
              min="0"
              max="100"
              placeholder="15"
              value={platformCommission}
              onChange={(e) => setPlatformCommission(Number(e.target.value))}
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {isEditing ? t("common.saving", "Saving...") : t("common.sending", "Sending...")}
              </>
            ) : (
              isEditing ? t("common.save", "Save Changes") : t("admin.invite.sendButton", "Send Invitation")
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
