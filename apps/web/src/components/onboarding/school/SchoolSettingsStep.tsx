"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { Bell, Users, UserPlus, ArrowLeft } from "lucide-react";

interface SchoolSettings {
  notifyOnStudentSignup: boolean;
  notifyOnAssessmentComplete: boolean;
  allowStudentSelfRegistration: boolean;
}

interface SchoolSettingsStepProps {
  data: SchoolSettings;
  onNext: (data: SchoolSettings) => void;
  onBack: () => void;
}

export function SchoolSettingsStep({
  data,
  onNext,
  onBack,
}: SchoolSettingsStepProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<SchoolSettings>(data);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(formData);
  };

  const settingsOptions = [
    {
      id: "notifyOnStudentSignup",
      icon: UserPlus,
      title: t(
        "onboarding.school.settings.notifySignup",
        "Notify on Student Signup",
      ),
      description: t(
        "onboarding.school.settings.notifySignupDesc",
        "Receive an email when a student accepts their invitation.",
      ),
      value: formData.notifyOnStudentSignup,
      onChange: (checked: boolean) =>
        setFormData((prev) => ({ ...prev, notifyOnStudentSignup: checked })),
    },
    {
      id: "notifyOnAssessmentComplete",
      icon: Bell,
      title: t(
        "onboarding.school.settings.notifyAssessment",
        "Notify on Assessment Complete",
      ),
      description: t(
        "onboarding.school.settings.notifyAssessmentDesc",
        "Receive an email when a student completes an assessment.",
      ),
      value: formData.notifyOnAssessmentComplete,
      onChange: (checked: boolean) =>
        setFormData((prev) => ({
          ...prev,
          notifyOnAssessmentComplete: checked,
        })),
    },
    {
      id: "allowStudentSelfRegistration",
      icon: Users,
      title: t(
        "onboarding.school.settings.selfRegistration",
        "Allow Student Self-Registration",
      ),
      description: t(
        "onboarding.school.settings.selfRegistrationDesc",
        "Allow students to register themselves using a school code.",
      ),
      value: formData.allowStudentSelfRegistration,
      onChange: (checked: boolean) =>
        setFormData((prev) => ({
          ...prev,
          allowStudentSelfRegistration: checked,
        })),
    },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {settingsOptions.map((option) => (
          <div
            key={option.id}
            className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors"
          >
            <div className="p-2 bg-white rounded-lg border border-gray-200 shrink-0">
              <option.icon className="h-5 w-5 text-gray-700" />
            </div>
            <div className="flex-1 min-w-0">
              <Label
                htmlFor={option.id}
                className="text-base font-medium text-gray-900 cursor-pointer"
              >
                {option.title}
              </Label>
              <p className="text-sm text-gray-500 mt-0.5">
                {option.description}
              </p>
            </div>
            <Switch
              id={option.id}
              checked={option.value}
              onCheckedChange={option.onChange}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="flex-1 h-12"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("common.back", "Back")}
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-black hover:bg-gray-800 text-white h-12 text-base font-medium"
        >
          {t("common.continue", "Continue")}
        </Button>
      </div>
    </form>
  );
}
