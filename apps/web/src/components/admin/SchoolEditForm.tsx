"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { School } from "@/types/school";
import { updateSchool } from "@/services/schoolService";

interface SchoolEditFormProps {
  school: School;
  onSuccess?: (school: School) => void;
}

export function SchoolEditForm({ school, onSuccess }: SchoolEditFormProps) {
  const [name, setName] = useState(school.name);
  const [adminEmail, setAdminEmail] = useState(school.adminEmail);
  const [maxStudents, setMaxStudents] = useState<number>(school.maxStudents);
  const [details, setDetails] = useState(school.details || "");
  const [contractStart, setContractStart] = useState<Date | undefined>(
    school.contractStart ? parseISO(school.contractStart) : undefined,
  );
  const [contractEnd, setContractEnd] = useState<Date | undefined>(
    school.contractEnd ? parseISO(school.contractEnd) : undefined,
  );
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async () => {
    if (!adminEmail || !name || !maxStudents) {
      toast.error(
        t("admin.invite.fillRequired", "Please fill in all required fields"),
      );
      return;
    }

    setIsLoading(true);
    try {
      await updateSchool(school.id, {
        name,
        adminEmail,
        maxStudents,
        details,
        contractStart: contractStart
          ? format(contractStart, "yyyy-MM-dd")
          : undefined,
        contractEnd: contractEnd
          ? format(contractEnd, "yyyy-MM-dd")
          : undefined,
      });

      const updatedSchool: School = {
        ...school,
        name,
        adminEmail,
        maxStudents,
        details,
        contractStart: contractStart
          ? format(contractStart, "yyyy-MM-dd")
          : undefined,
        contractEnd: contractEnd
          ? format(contractEnd, "yyyy-MM-dd")
          : undefined,
      };

      onSuccess?.(updatedSchool);
      toast.success(
        t("admin.schools.updateSuccess", "School updated successfully"),
      );
    } catch (error) {
      toast.error(t("admin.schools.updateError", "Failed to update school"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="edit-name">
          {t("admin.schools.name", "School Name")}
        </Label>
        <Input
          id="edit-name"
          type="text"
          placeholder={t(
            "admin.schools.namePlaceholder",
            "e.g. Springfield High",
          )}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-adminEmail">
          {t("admin.schools.email", "Admin Email")}
        </Label>
        <Input
          id="edit-adminEmail"
          type="email"
          placeholder={t("admin.schools.emailPlaceholder", "admin@school.com")}
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-maxStudents">
          {t("admin.schools.maxStudents", "Max Students")}
        </Label>
        <Input
          id="edit-maxStudents"
          type="number"
          placeholder="0"
          value={maxStudents || ""}
          onChange={(e) => setMaxStudents(parseInt(e.target.value))}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 flex flex-col">
          <Label>
            {t("admin.invite.contractStart", "Contract Start Date")}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !contractStart && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                {contractStart ? (
                  format(contractStart, "PPP")
                ) : (
                  <span>{t("common.pickDate", "Pick a date")}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={contractStart}
                onSelect={setContractStart}
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
                  !contractEnd && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                {contractEnd ? (
                  format(contractEnd, "PPP")
                ) : (
                  <span>{t("common.pickDate", "Pick a date")}</span>
                )}
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
        <Label htmlFor="edit-details">
          {t("admin.schools.details", "Details / Contract Info")}
        </Label>
        <Textarea
          id="edit-details"
          placeholder={t(
            "admin.schools.detailsPlaceholder",
            "Enter contract info or other details...",
          )}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="min-h-[100px]"
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gray-900 hover:bg-black text-white"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {t("common.saving", "Saving...")}
          </>
        ) : (
          t("common.saveChanges", "Save Changes")
        )}
      </Button>
    </form>
  );
}
