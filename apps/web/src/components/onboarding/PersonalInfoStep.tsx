import React, { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CoachOnboardingData } from "./types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Upload,
  User,
  Briefcase,
  MapPin,
  Globe,
  Tag,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface PersonalInfoStepProps {
  data: CoachOnboardingData["personalInfo"];
  onNext: (data: CoachOnboardingData["personalInfo"]) => void;
}

export function PersonalInfoStep({ data, onNext }: PersonalInfoStepProps) {
  const { t } = useTranslation();
  const [imagePreview, setImagePreview] = React.useState<string | null>(
    data.image
  );

  const personalInfoSchema = useMemo(() => z.object({
    name: z.string().min(2, t("onboarding.validation.nameRequired", "Name is required")),
    title: z.string().min(2, t("onboarding.validation.titleRequired", "Job title is required")),
    bio: z.string().min(10, t("onboarding.validation.bioMin", "Bio must be at least 10 characters")),
    specialization: z.string().min(2, t("onboarding.validation.specializationRequired", "Specialization is required")),
    location: z.string().min(2, t("onboarding.validation.locationRequired", "Location is required")),
    languages: z.string().min(2, t("onboarding.validation.languageRequired", "At least one language is required")),
    tags: z.string().min(2, t("onboarding.validation.tagRequired", "At least one tag is required")),
  }), [t]);

  type PersonalInfoFormValues = z.infer<typeof personalInfoSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonalInfoFormValues>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      ...data,
      languages: data.languages.join(", "),
      tags: data.tags.join(", "),
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        const { uploadProfileImage } = await import("@/services/coachService");
        const { url } = await uploadProfileImage(file);
        setImagePreview(url);
      } catch (error) {
      // error handled silently
    }
    }
  };

  const onSubmit = (values: PersonalInfoFormValues) => {
    onNext({
      ...values,
      languages: values.languages.split(",").map((s) => s.trim()),
      tags: values.tags.split(",").map((s) => s.trim()),
      image: imagePreview,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="flex items-center gap-6 p-4 border border-gray-100 rounded-xl bg-gray-50/50">
        <div className="relative group cursor-pointer shrink-0">
          <Avatar className="h-20 w-20 border-2 border-white shadow-md">
            <AvatarImage src={imagePreview || ""} className="object-cover" />
            <AvatarFallback className="bg-gray-200 text-gray-400">
              <User className="h-8 w-8" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200" aria-hidden="true">
            <Upload className="h-5 w-5 text-white" />
          </div>
          <input
            type="file"
            accept="image/*"
            aria-label={t("onboarding.personalInfo.uploadPhoto", "Upload profile photo")}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleImageUpload}
          />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{t("onboarding.personalInfo.profilePhoto", "Profile Photo")}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {t("onboarding.personalInfo.uploadHint", "Upload a professional photo. JPG, GIF or PNG. Max size of 800K.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-gray-700 font-medium">
            {t("onboarding.personalInfo.fullName", "Full Name")}
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="name"
              {...register("name")}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              className="pl-9 bg-gray-50/30 border-gray-200 focus:bg-white transition-all h-11"
              placeholder={t("onboarding.personalInfo.namePlaceholder", "e.g. Sarah Wilson")}
            />
          </div>
          {errors.name && (
            <p id="name-error" className="text-red-500 text-xs mt-1" role="alert">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="title" className="text-gray-700 font-medium">
            {t("onboarding.personalInfo.jobTitle", "Job Title")}
          </Label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="title"
              {...register("title")}
              className="pl-9 bg-gray-50/30 border-gray-200 focus:bg-white transition-all h-11"
              placeholder={t("onboarding.personalInfo.titlePlaceholder", "e.g. Senior Career Coach")}
            />
          </div>
          {errors.title && (
            <p id="title-error" className="text-red-500 text-xs mt-1" role="alert">{errors.title.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio" className="text-gray-700 font-medium">
          {t("onboarding.personalInfo.bio", "Bio")}
        </Label>
        <Textarea
          id="bio"
          {...register("bio")}
          placeholder={t("onboarding.personalInfo.bioPlaceholder", "Tell us about your experience and coaching style...")}
          className="min-h-[120px] bg-gray-50/30 border-gray-200 focus:bg-white transition-all resize-none p-4"
        />
        {errors.bio && (
          <p className="text-red-500 text-xs mt-1">{errors.bio.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="specialization" className="text-gray-700 font-medium">
            {t("onboarding.personalInfo.specialization", "Primary Specialization")}
          </Label>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="specialization"
              {...register("specialization")}
              aria-invalid={!!errors.specialization}
              aria-describedby={errors.specialization ? "specialization-error" : undefined}
              className="pl-9 bg-gray-50/30 border-gray-200 focus:bg-white transition-all h-11"
              placeholder={t("onboarding.personalInfo.specializationPlaceholder", "e.g. Tech Leadership")}
            />
          </div>
          {errors.specialization && (
            <p id="specialization-error" className="text-red-500 text-xs mt-1" role="alert">
              {errors.specialization.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="location" className="text-gray-700 font-medium">
            {t("onboarding.personalInfo.location", "Location")}
          </Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="location"
              {...register("location")}
              className="pl-9 bg-gray-50/30 border-gray-200 focus:bg-white transition-all h-11"
              placeholder={t("onboarding.personalInfo.locationPlaceholder", "e.g. San Francisco, CA")}
            />
          </div>
          {errors.location && (
            <p id="location-error" className="text-red-500 text-xs mt-1" role="alert">
              {errors.location.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-2">
          <Label htmlFor="languages" className="text-gray-700 font-medium">
            {t("onboarding.personalInfo.languages", "Languages")}
          </Label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="languages"
              {...register("languages")}
              className="pl-9 bg-gray-50/30 border-gray-200 focus:bg-white transition-all h-11"
              placeholder={t("onboarding.personalInfo.languagesPlaceholder", "e.g. English, Spanish")}
            />
          </div>
          {errors.languages && (
            <p className="text-red-500 text-xs mt-1">
              {errors.languages.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags" className="text-gray-700 font-medium">
          {t("onboarding.personalInfo.skills", "Skills / Tags")}
        </Label>
        <div className="relative">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            id="tags"
            {...register("tags")}
            className="pl-9 bg-gray-50/30 border-gray-200 focus:bg-white transition-all h-11"
            placeholder={t("onboarding.personalInfo.skillsPlaceholder", "e.g. Leadership, Management, Public Speaking")}
          />
        </div>
        {errors.tags && (
          <p className="text-red-500 text-xs mt-1">{errors.tags.message}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full bg-black text-white hover:bg-gray-800 h-12 text-base font-medium rounded-lg shadow-lg shadow-black/10 transition-all hover:shadow-xl hover:-translate-y-0.5"
      >
        {t("onboarding.personalInfo.continue", "Continue to Availability")}
      </Button>
    </form>
  );
}
