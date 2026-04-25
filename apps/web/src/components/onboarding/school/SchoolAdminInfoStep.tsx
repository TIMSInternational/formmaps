"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import {
  Building2,
  User,
  Phone,
  Briefcase,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { motion } from "motion/react";

interface AdminInfo {
  name: string;
  phone?: string;
  position?: string;
}

interface SchoolAdminInfoStepProps {
  data: AdminInfo;
  schoolName: string;
  email: string;
  onNext: (data: AdminInfo) => void;
}

export function SchoolAdminInfoStep({
  data,
  schoolName,
  email,
  onNext,
}: SchoolAdminInfoStepProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<AdminInfo>(data);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = t("validation.required", "This field is required");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onNext(formData);
    }
  };

  const handleFocus = (field: string) => setFocusedField(field);
  const handleBlur = () => setFocusedField(null);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* School Info (Read-only) - Card Style */}
      <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 border border-gray-100 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110 duration-500 ease-out"></div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-5 relative z-10">
          <div className="h-12 w-12 bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-center shrink-0">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>

          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {t("onboarding.school.schoolName", "School")}
            </p>
            <h3 className="text-lg font-bold text-gray-900 leading-tight">
              {schoolName}
            </h3>
          </div>

          <div className="h-px w-full sm:w-px sm:h-10 bg-gray-200 max-sm:my-1"></div>

          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {t("onboarding.school.adminEmail", "Admin Email")}
            </p>
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <Mail className="h-3.5 w-3.5 text-gray-400" />
              <span className="truncate">{email}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Admin Name */}
        <div className="space-y-2">
          <Label
            htmlFor="name"
            className="text-sm font-medium text-gray-700 ml-1"
          >
            {t("onboarding.school.adminName", "Your Full Name")}{" "}
            <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <div
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-colors duration-200"
              style={{ color: focusedField === "name" ? "#2563eb" : "" }}
            >
              <User className="h-5 w-5" />
            </div>
            <Input
              id="name"
              type="text"
              placeholder={t("onboarding.school.namePlaceholder", "John Smith")}
              value={formData.name}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, name: e.target.value }));
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
              }}
              onFocus={() => handleFocus("name")}
              onBlur={handleBlur}
              className={`pl-11 h-12 transition-all duration-200 border-gray-200 hover:border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${errors.name ? "border-red-300 focus:border-red-500 focus:ring-red-500/10" : ""}`}
            />
            {formData.name && !errors.name && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none animate-in fade-in zoom-in duration-200">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            )}
          </div>
          {errors.name && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-500 font-medium ml-1"
            >
              {errors.name}
            </motion.p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Position */}
          <div className="space-y-2">
            <Label
              htmlFor="position"
              className="text-sm font-medium text-gray-700 ml-1"
            >
              {t("onboarding.school.position", "Position / Title")}
            </Label>
            <div className="relative">
              <div
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-colors duration-200"
                style={{ color: focusedField === "position" ? "#2563eb" : "" }}
              >
                <Briefcase className="h-5 w-5" />
              </div>
              <Input
                id="position"
                type="text"
                placeholder={t(
                  "onboarding.school.positionPlaceholder",
                  "Principal, Administrator",
                )}
                value={formData.position || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, position: e.target.value }))
                }
                onFocus={() => handleFocus("position")}
                onBlur={handleBlur}
                className="pl-11 h-12 transition-all duration-200 border-gray-200 hover:border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label
              htmlFor="phone"
              className="text-sm font-medium text-gray-700 ml-1"
            >
              {t("onboarding.school.phone", "Phone Number")}
            </Label>
            <div className="relative">
              <div
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-colors duration-200"
                style={{ color: focusedField === "phone" ? "#2563eb" : "" }}
              >
                <Phone className="h-5 w-5" />
              </div>
              <Input
                id="phone"
                type="tel"
                placeholder={t(
                  "onboarding.school.phonePlaceholder",
                  "+1 (555) 123-4567",
                )}
                value={formData.phone || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                onFocus={() => handleFocus("phone")}
                onBlur={handleBlur}
                className="pl-11 h-12 transition-all duration-200 border-gray-200 hover:border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          className="w-full bg-gray-900 hover:bg-black text-white h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 rounded-xl"
        >
          {t("common.continue", "Continue")}
        </Button>
      </div>
    </form>
  );
}
