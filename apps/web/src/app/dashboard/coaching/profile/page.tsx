"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Camera,
  Mail,
  Phone,
  MapPin,
  Globe,
  Linkedin,
  Twitter,
  User,
} from "lucide-react";

export default function CoachProfilePage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [profileData, setProfileData] = useState({
    name: user.name || "",
    email: user.email || "",
    title: "",
    bio: "",
    phone: "",
    location: "",
    website: "",
    linkedin: "",
    twitter: "",
  });

  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        // Use /coach/me which resolves by userId (not coach ID)
        const { getCoachProfile } = await import("@/services/coachService");
        const data = await getCoachProfile();

        if (data) {
          setProfileData((prev) => ({
            ...prev,
            name: data.name || user.name || "",
            title: data.title || "",
            bio: data.bio || "",
            location: data.location || "",
            phone: (data as any).phone || "",
            website: (data as any).website || "",
            linkedin: (data as any).linkedin || "",
            twitter: (data as any).twitter || "",
          }));
        }
      } catch {
        // Profile data is optional — degrade gracefully
      } finally {
        setIsLoading(false);
      }
    };

    if (user.id) fetchProfile();
  }, [user.id, user.name]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const { updateCoachProfile } = await import("@/services/coachService");
      await updateCoachProfile({
        name: profileData.name,
        title: profileData.title,
        bio: profileData.bio,
        location: profileData.location,
        phone: profileData.phone,
        website: profileData.website,
        linkedin: profileData.linkedin,
        twitter: profileData.twitter,
      } as any);

      toast.success(t("coaching.profile.updated"));
      setIsEditing(false);
    } catch {
      toast.error(t("coaching.profile.failedToUpdate"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);

      toast.info(t("coaching.profile.uploading"));
      const { uploadProfileImage } = await import("@/services/coachService");
      await uploadProfileImage(file);
      toast.success(t("coaching.profile.uploadSuccess"));
    } catch {
      toast.error(t("coaching.profile.uploadFailed"));
      setAvatarPreview(null);
    }
  };

  const completionPercentage = React.useMemo(() => {
    const fields = ["name", "title", "bio", "email", "phone", "location", "website", "linkedin", "twitter"];
    const filled = fields.filter((f) => profileData[f as keyof typeof profileData]?.length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [profileData]);

  const update = (field: string, value: string) =>
    setProfileData((prev) => ({ ...prev, [field]: value }));

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-4 h-96" />
          <Skeleton className="lg:col-span-8 h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Coach</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mt-1">Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your public presence. A complete profile helps students connect with you.
          </p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar */}
        <div className="lg:col-span-4 lg:sticky lg:top-8">
          <div className="dash-card overflow-hidden">
            {/* Avatar Section */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 h-24" />
            <div className="flex flex-col items-center -mt-12 pb-6 px-6">
              <div className="relative group">
                <Avatar className="h-24 w-24 border-4 border-[var(--card,#fff)] shadow-lg">
                  <AvatarImage src={avatarPreview || user.image || user.avatar || undefined} className="object-cover" />
                  <AvatarFallback className="bg-[var(--admin-bg-hover)] text-muted-foreground text-3xl font-bold">
                    {user.name?.charAt(0).toUpperCase() || "C"}
                  </AvatarFallback>
                </Avatar>
                {isEditing && (
                  <label htmlFor="avatar-upload" className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="h-5 w-5 text-white" />
                    <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                )}
              </div>

              <h2 className="text-lg font-bold text-foreground mt-4">{profileData.name || "Your Name"}</h2>
              <p className="text-sm text-muted-foreground">{profileData.title || "Coach"}</p>

              <div className="w-full mt-6 space-y-2">
                <div className="flex items-center gap-3 text-sm text-muted-foreground p-2.5 rounded-lg bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))]">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{profileData.email}</span>
                </div>
                {profileData.location && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground p-2.5 rounded-lg bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))]">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{profileData.location}</span>
                  </div>
                )}
              </div>

              {/* Completion */}
              <div className="w-full mt-6 pt-4 border-t border-[var(--border)]">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-muted-foreground font-medium">Profile Strength</span>
                  <span className={completionPercentage === 100 ? "text-emerald-500 font-bold" : "text-[#2E9098] font-bold"}>
                    {completionPercentage}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[var(--admin-bg-hover)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${completionPercentage === 100 ? "bg-emerald-500" : "bg-[#2E9098]"}`}
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-8 space-y-6">
          {/* Personal Details */}
          <div className="dash-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#2E9098]/10 flex items-center justify-center">
                <User className="h-4 w-4 text-[#2E9098]" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">Personal Details</span>
                <p className="text-xs text-muted-foreground">Basic identity information</p>
              </div>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Full Name</Label>
                <Input value={profileData.name} onChange={(e) => update("name", e.target.value)} disabled={!isEditing} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Professional Title</Label>
                <Input value={profileData.title} onChange={(e) => update("title", e.target.value)} disabled={!isEditing} placeholder="e.g. Career Coach" />
              </div>
              <div className="col-span-1 md:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">About You</Label>
                <Textarea value={profileData.bio} onChange={(e) => update("bio", e.target.value)} disabled={!isEditing} rows={4} placeholder="Tell students about your experience..." className="resize-none" />
                <p className="text-right text-[11px] text-muted-foreground">{profileData.bio?.length || 0} / 500</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email (Private)</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={profileData.email} disabled className="pl-9 cursor-not-allowed" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Phone (Private)</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="tel" value={profileData.phone} onChange={(e) => update("phone", e.target.value)} disabled={!isEditing} placeholder="+1 (555) 000-0000" className="pl-9" />
                </div>
              </div>
              <div className="col-span-1 md:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Location</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={profileData.location} onChange={(e) => update("location", e.target.value)} disabled={!isEditing} placeholder="City, Country" className="pl-9" />
                </div>
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="dash-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Globe className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">Social Presence</span>
                <p className="text-xs text-muted-foreground">Where can students find more about you?</p>
              </div>
            </div>
            <div className="p-5 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Personal Website</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="url" value={profileData.website} onChange={(e) => update("website", e.target.value)} disabled={!isEditing} placeholder="https://yourwebsite.com" className="pl-9" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">LinkedIn</Label>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0A66C2]" />
                    <Input type="url" value={profileData.linkedin} onChange={(e) => update("linkedin", e.target.value)} disabled={!isEditing} placeholder="linkedin.com/in/username" className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Twitter / X</Label>
                  <div className="relative">
                    <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground" />
                    <Input type="url" value={profileData.twitter} onChange={(e) => update("twitter", e.target.value)} disabled={!isEditing} placeholder="twitter.com/username" className="pl-9" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
