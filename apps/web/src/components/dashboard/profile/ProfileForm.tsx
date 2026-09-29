"use client";

import { motion } from "motion/react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FiSave, FiGithub, FiTwitter, FiLinkedin, FiPlus, FiTrash2, FiLink } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getUserProfile, updateUserProfile } from "@/services/userService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { FormSkeleton } from "@/components/skeletons/FormSkeleton";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { telemetry } from "@/services/telemetryService";

// Robust Schema (messages resolved in the current UI language)
const makeProfileSchema = (t: TFunction) => z.object({
  fullName: z.string().min(2, t("components.ProfileForm.validation.nameMin")),
  headline: z.string().max(100, t("components.ProfileForm.validation.headlineMax")).optional(),
  bio: z.string().max(500, t("components.ProfileForm.validation.bioMax")).optional(),
  location: z.string().optional(),
  email: z.string().email(t("components.ProfileForm.validation.emailInvalid")),
  phone: z.string().optional(),
  socialLinks: z.object({
    website: z.string().url(t("components.ProfileForm.validation.urlInvalid")).optional().or(z.literal("")),
    github: z.string().url(t("components.ProfileForm.validation.urlInvalid")).optional().or(z.literal("")),
    twitter: z.string().url(t("components.ProfileForm.validation.urlInvalid")).optional().or(z.literal("")),
    linkedin: z.string().url(t("components.ProfileForm.validation.urlInvalid")).optional().or(z.literal("")),
  }),
  skills: z.array(z.string()),
  competencies: z.array(z.object({
    label: z.string().min(1, t("components.ProfileForm.validation.skillNameRequired")),
    level: z.number().min(0).max(100)
  }))
});

type ProfileFormValues = z.infer<ReturnType<typeof makeProfileSchema>>;

export function ProfileForm() {
  const { user, setUser } = useGlobalStore();
  const [newSkill, setNewSkill] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation();
  const profileSchema = useMemo(() => makeProfileSchema(t), [t]);

  const { register, control, handleSubmit, setValue, watch, reset, getValues, formState: { errors, isSubmitting } } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: "",
      headline: "",
      bio: "",
      location: "",
      email: "",
      phone: "",
      socialLinks: {
        website: "",
        github: "",
        twitter: "",
        linkedin: "",
      },
      skills: [],
      competencies: []
    }
  });

  // Autosave hook for form drafts
  const autosave = useFormAutosave("profile_form", {
    debounceMs: 2000,
    onRestoreSuccess: (data) => {
      reset(data as ProfileFormValues);
      toast.info(t("components.ProfileForm.draftRestored"));
    },
  });

  // Fetch profile data on mount
  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      try {
        const profile = await getUserProfile();
        // Reset form with fetched data
        reset({
          fullName: profile.fullName || user.name || "",
          headline: profile.headline || "",
          bio: profile.bio || "",
          location: profile.location || "",
          email: profile.email || user.email || "",
          phone: profile.phone || "",
          socialLinks: {
            website: profile.socialLinks?.website || "",
            github: profile.socialLinks?.github || "",
            twitter: profile.socialLinks?.twitter || "",
            linkedin: profile.socialLinks?.linkedin || "",
          },
          skills: profile.skills || [],
          competencies: []
        });
      } catch (error) {
        // Fallback to global store data
        reset({
          fullName: user.name || "",
          headline: "",
          bio: "",
          location: "",
          email: user.email || "",
          phone: "",
          socialLinks: { website: "", github: "", twitter: "", linkedin: "" },
          skills: [],
          competencies: []
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [reset, user.name, user.email]);

  const { fields: competencyFields, append: appendCompetency, remove: removeCompetency } = useFieldArray({
    control,
    name: "competencies"
  });

  const currentSkills = watch("skills");

  const handleAddSkill = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (newSkill.trim() && !currentSkills.includes(newSkill.trim())) {
        setValue('skills', [...currentSkills, newSkill.trim()]);
        setNewSkill("");
      }
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setValue('skills', currentSkills.filter(skill => skill !== skillToRemove));
  };

  const onSubmit = async (data: ProfileFormValues) => {
    const startTime = Date.now();
    try {
      await updateUserProfile({
        fullName: data.fullName,
        headline: data.headline,
        bio: data.bio,
        location: data.location,
        phone: data.phone,
        socialLinks: data.socialLinks,
        skills: data.skills,
      });
      // Update global store with new name
      setUser({ name: data.fullName });
      // Clear autosave draft on successful submit
      await autosave.clearDraft();
      // Track form completion
      telemetry.trackForm("complete", "profile_form", "/dashboard/profile", Date.now() - startTime);
      toast.success(t("components.ProfileForm.updateSuccess"));
    } catch (error: any) {
      toast.error(error.message || t("components.ProfileForm.updateError"));
    }
  };

  if (isLoading) {
    return <FormSkeleton />;
  }


  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-5xl mx-auto">

        {/* Basic Info Section */}
        <Card className="border-none shadow-sm bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl glass-card">{t('profile.personalInfoTitle')}</CardTitle>
            <CardDescription>{t('profile.personalInfoDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 glass-card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("components.ProfileForm.fullName")}</Label>
                <Input id="fullName" {...register("fullName")} className="bg-white/50 dark:bg-gray-900/50" aria-invalid={!!errors.fullName} />
                {errors.fullName && <p role="alert" className="text-red-500 text-xs mt-1">{errors.fullName.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="headline">{t("components.ProfileForm.headline")}</Label>
                <Input id="headline" {...register("headline")} placeholder={t('profile.headlinePlaceholder')} className="bg-white/50 dark:bg-gray-900/50" aria-invalid={!!errors.headline} />
                {errors.headline && <p role="alert" className="text-red-500 text-xs mt-1">{errors.headline.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("components.ProfileForm.email")}</Label>
                <Input id="email" type="email" {...register("email")} className="bg-white/50 dark:bg-gray-900/50" aria-invalid={!!errors.email} />
                {errors.email && <p role="alert" className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">{t("components.ProfileForm.location")}</Label>
                <Input id="location" {...register("location")} className="bg-white/50 dark:bg-gray-900/50" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">{t("components.ProfileForm.bio")}</Label>
              <Textarea
                id="bio"
                {...register("bio")}
                className="min-h-[120px] bg-white/50 dark:bg-gray-900/50 resize-none"
                aria-invalid={!!errors.bio}
              />
              <p className="text-xs text-gray-500 text-right" aria-live="polite">{t("components.ProfileForm.bioCounter", { count: watch("bio")?.length || 0 })}</p>
            </div>
          </CardContent>
        </Card>

        {/* Social Links Section */}
        <Card className="border-none shadow-sm bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl glass-card">{t("components.ProfileForm.socialTitle")}</CardTitle>
            <CardDescription>{t("components.ProfileForm.socialDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="social-website" className="flex items-center gap-2"><FiLink aria-hidden="true" /> {t("components.ProfileForm.website")}</Label>
                <Input id="social-website" {...register("socialLinks.website")} placeholder={t('profile.websitePlaceholder')} className="bg-white/50 dark:bg-gray-900/50" />
                {errors.socialLinks?.website && <p role="alert" className="text-red-500 text-xs">{errors.socialLinks.website.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="social-github" className="flex items-center gap-2"><FiGithub aria-hidden="true" /> GitHub</Label>
                <Input id="social-github" {...register("socialLinks.github")} placeholder={t('profile.githubPlaceholder')} className="bg-white/50 dark:bg-gray-900/50" />
                {errors.socialLinks?.github && <p role="alert" className="text-red-500 text-xs">{errors.socialLinks.github.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="social-twitter" className="flex items-center gap-2"><FiTwitter aria-hidden="true" /> Twitter / X</Label>
                <Input id="social-twitter" {...register("socialLinks.twitter")} placeholder={t('profile.twitterPlaceholder')} className="bg-white/50 dark:bg-gray-900/50" />
                {errors.socialLinks?.twitter && <p role="alert" className="text-red-500 text-xs">{errors.socialLinks.twitter.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="social-linkedin" className="flex items-center gap-2"><FiLinkedin aria-hidden="true" /> LinkedIn</Label>
                <Input id="social-linkedin" {...register("socialLinks.linkedin")} placeholder={t('profile.linkedinPlaceholder')} className="bg-white/50 dark:bg-gray-900/50" />
                {errors.socialLinks?.linkedin && <p role="alert" className="text-red-500 text-xs">{errors.socialLinks.linkedin.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills & Competencies */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Skills Tags */}
          <Card className="border-none shadow-sm bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="text-xl glass-card" id="skills-title">{t("components.ProfileForm.skillsTitle")}</CardTitle>
              <CardDescription>{t("profile.skillsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 glass-card">
              <Input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={handleAddSkill}
                placeholder={t('profile.skillInputPlaceholder')}
                className="bg-white/50 dark:bg-gray-900/50"
                aria-labelledby="skills-title"
                aria-label={t('profile.addSkillAria')}
              />
              <div className="flex flex-wrap gap-2 min-h-[100px] content-start" role="list" aria-label={t("components.ProfileForm.skillsListAria")}>
                {currentSkills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="px-3 py-1 text-sm bg-[var(--admin-accent-blue)]/10 text-[var(--admin-accent-blue)] hover:bg-[var(--admin-accent-blue)]/20 dark:bg-[var(--admin-accent-blue)]/20 dark:text-[var(--admin-accent-blue)]" role="listitem">
                    {skill}
                    <button type="button" onClick={() => removeSkill(skill)} className="ml-2 hover:text-red-500" aria-label={t("components.ProfileForm.removeSkillAria", { skill })}>×</button>
                  </Badge>
                ))}
                {currentSkills.length === 0 && <span className="text-sm text-gray-400 italic">{t('profile.noSkillsYet')}</span>}
              </div>
            </CardContent>
          </Card>

          {/* Competencies Sliders */}
          <Card className="border-none shadow-sm bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm h-full">
            <CardHeader className="flex flex-row items-center justify-between glass-card">
              <div>
                <CardTitle className="text-xl glass-card">{t("components.ProfileForm.competenciesTitle")}</CardTitle>
                <CardDescription>{t("components.ProfileForm.competenciesDescription")}</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => appendCompetency({ label: t("components.ProfileForm.newSkill"), level: 50 })}>
                <FiPlus className="mr-2" aria-hidden="true" /> {t("components.ProfileForm.add")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 glass-card">
              {competencyFields.map((field, index) => (
                <div key={field.id} className="space-y-3 p-3 bg-white/50 dark:bg-gray-900/50 rounded-xl relative group">
                  <div className="flex gap-4 items-center">
                    <Input
                      {...register(`competencies.${index}.label`)}
                      className="h-8 border-none bg-transparent font-medium p-0 focus-visible:ring-0"
                      aria-label={t("components.ProfileForm.competencyNameAria", { number: index + 1 })}
                      placeholder={t('profile.skillNamePlaceholder')}
                    />
                    <button type="button" onClick={() => removeCompetency(index)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" aria-label={t("components.ProfileForm.removeCompetencyAria", { number: index + 1 })}>
                      <FiTrash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <Slider
                      defaultValue={[field.level]}
                      max={100}
                      step={1}
                      className="flex-1"
                      onValueChange={(vals) => setValue(`competencies.${index}.level`, vals[0])}
                      aria-label={t("components.ProfileForm.proficiencyAria", { name: watch(`competencies.${index}.label`) || t("components.ProfileForm.competencyFallback") })}
                    />
                    <span className="text-sm font-bold w-12 text-right" aria-hidden="true">{watch(`competencies.${index}.level`)}%</span>
                  </div>
                </div>
              ))}
              {competencyFields.length === 0 && <p className="text-sm text-gray-400 italic text-center py-4">{t("components.ProfileForm.noCompetencies")}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Save Actions */}
        <div className="flex justify-end pt-4 pb-12">
          <Button type="submit" size="lg" className="w-full md:w-auto bg-[var(--admin-accent-blue)] hover:bg-[var(--admin-accent-blue)]/90 shadow-xl shadow-[var(--admin-accent-blue)]/20 dark:shadow-none" disabled={isSubmitting}>
            {isSubmitting ? (
              t("components.ProfileForm.saving")
            ) : (
              <>
                <FiSave className="mr-2" aria-hidden="true" /> {t("components.ProfileForm.save")}
              </>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
