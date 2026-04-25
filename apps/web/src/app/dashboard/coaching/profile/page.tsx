"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Camera,
  Mail,
  Phone,
  MapPin,
  Globe,
  Linkedin,
  Twitter,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function CoachProfilePage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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

  // Fetch profile data on mount
  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        // Dynamically import to avoid server-side issues if any
        const { getCoachDetails } = await import("@/services/coachService");
        if (!user.id) return;
        const data = await getCoachDetails(user.id);

        if (data) {
          setProfileData((prev) => ({
            ...prev,
            name: data.name || user.name || "",
            // email is usually not editable or comes from user store
            title: data.title || "",
            bio: data.bio || "",
            location: data.location || "",
            // Map other fields if they exist in the API response
            // Note: Phone and Social links might not be in the standard Coach type yet
            // but we'll preserve local state if they aren't returned
          }));
        }
      } catch (error) {
        toast.error(t("coaching.profile.failedToLoad"));
      } finally {
        setIsLoading(false);
      }
    };

    if (user.id) {
      fetchProfile();
    }
  }, [user.id, user.name]);

  const handleSave = async () => {
    try {
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
      });

      toast.success(t("coaching.profile.updated"));
      setIsEditing(false);
    } catch (error) {
      toast.error(t("coaching.profile.failedToUpdate"));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true); // Block interaction

      // Create immediate preview using safe Base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setAvatarPreview(base64String);
      };
      reader.readAsDataURL(file);

      toast.info(t("coaching.profile.uploading"));

      const { uploadProfileImage } = await import("@/services/coachService");
      await uploadProfileImage(file);

      toast.success(t("coaching.profile.uploadSuccess"));
    } catch (error) {
      toast.error(t("coaching.profile.uploadFailed"));
      // Revert preview on error if desired, but user might retry
      setAvatarPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate profile completion
  const completionPercentage = React.useMemo(() => {
    const fields = [
      "name",
      "title",
      "bio",
      "email",
      "phone",
      "location",
      "website",
      "linkedin",
      "twitter",
    ];
    const filled = fields.filter(
      (f) => profileData[f as keyof typeof profileData]?.length > 0
    ).length;
    return Math.round((filled / fields.length) * 100);
  }, [profileData]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] relative overflow-hidden selection:bg-blue-100 selection:text-blue-900">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-100/40 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 mix-blend-multiply" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-100/40 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2 mix-blend-multiply" />
        <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px] bg-white/40 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <div className="container max-w-6xl mx-auto py-12 px-4 sm:px-6 relative z-10">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
              Profile &{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                Identity
              </span>
            </h1>
            <p className="text-lg text-gray-500 font-medium max-w-xl">
              Manage your public presence. A complete profile helps students
              trust and connect with you.
            </p>
          </div>

          <div className="flex gap-3">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                className="bg-gray-900 text-white hover:bg-black rounded-2xl px-8 h-12 font-bold shadow-xl shadow-gray-900/10 hover:shadow-gray-900/20 transition-all hover:scale-105 active:scale-95"
              >
                Edit Profile
              </Button>
            ) : (
              <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
                <Button
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  className="rounded-xl px-6 h-10 font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl px-6 h-10 font-semibold shadow-md shadow-blue-600/20"
                >
                  Save Changes
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Sidebar (Sticky) */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8 animate-in fade-in slide-in-from-left-4 duration-700 delay-100">
            {/* Profile Card */}
            <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] border border-white/60 shadow-xl shadow-blue-900/5 flex flex-col items-center text-center relative overflow-hidden group">
              {/* Decorative Cover */}
              <div className="absolute top-0 left-0 w-full h-36 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 opacity-90 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
              </div>

              <div className="relative mt-16 mb-6">
                <div className="h-40 w-40 rounded-full p-1.5 bg-white shadow-2xl ring-4 ring-blue-50/50 overflow-hidden relative group-hover:scale-105 transition-transform duration-500 cubic-[0.34,1.56,0.64,1]">
                  <Avatar className="h-full w-full border-4 border-white">
                    <AvatarImage
                      src={
                        avatarPreview ||
                        user.image ||
                        user.avatar ||
                        undefined
                      }
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-gray-100 text-gray-400 text-5xl font-bold">
                      {user.name?.charAt(0).toUpperCase() || "C"}
                    </AvatarFallback>
                  </Avatar>

                  {isEditing && (
                    <label
                      htmlFor="avatar-upload"
                      className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                    >
                      <Camera className="h-8 w-8 text-white drop-shadow-lg mb-1" />
                      <span className="text-white text-xs font-bold uppercase tracking-widest drop-shadow-md">
                        Change
                      </span>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </label>
                  )}
                </div>
                {isEditing && (
                  <div className="absolute bottom-1 right-2 translate-x-0 translate-y-0">
                    <div className="bg-blue-600 text-white p-2.5 rounded-2xl shadow-lg border-4 border-white pointer-events-none animate-bounce">
                      <Camera className="h-4 w-4" />
                    </div>
                  </div>
                )}
              </div>

              <div className="px-8 pb-8 w-full">
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                  {profileData.name || "Your Name"}
                </h2>
                <p className="text-blue-600 font-semibold bg-blue-50 px-3 py-1 rounded-full text-sm inline-block mb-6">
                  {profileData.title || "Coach Title"}
                </p>

                <div className="space-y-3 w-full">
                  <div className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50/80 p-3 rounded-2xl border border-gray-100 transition-colors hover:bg-blue-50/50 hover:border-blue-100 group/item">
                    <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-blue-500 group-hover/item:text-blue-600 group-hover/item:scale-110 transition-all">
                      <Mail className="h-4 w-4" />
                    </div>
                    <span className="truncate font-medium">
                      {profileData.email}
                    </span>
                  </div>
                  {profileData.location && (
                    <div className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50/80 p-3 rounded-2xl border border-gray-100 transition-colors hover:bg-purple-50/50 hover:border-purple-100 group/item">
                      <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-purple-500 group-hover/item:text-purple-600 group-hover/item:scale-110 transition-all">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <span className="truncate font-medium">
                        {profileData.location}
                      </span>
                    </div>
                  )}
                </div>

                {/* Completion Widget */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Profile Strength
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        completionPercentage === 100
                          ? "text-green-500"
                          : "text-blue-500"
                      }`}
                    >
                      {completionPercentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${
                        completionPercentage === 100
                          ? "bg-green-500"
                          : "bg-gradient-to-r from-blue-500 to-purple-500"
                      }`}
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                  {completionPercentage < 100 && (
                    <p className="text-xs text-gray-400 mt-2 font-medium">
                      Add more details to reach 100%
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Edit Form */}
          <div className="lg:col-span-8 space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            {/* Personal Details Card */}
            <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] border border-white/60 shadow-xl shadow-blue-900/5 p-8 sm:p-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner">
                  <div className="h-3 w-3 rounded-full bg-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Personal Details
                  </h3>
                  <p className="text-gray-500 text-sm">
                    Correct information helps verify your identity.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-gray-700 ml-1">
                    Full Name
                  </Label>
                  <Input
                    value={profileData.name}
                    onChange={(e) =>
                      setProfileData({ ...profileData, name: e.target.value })
                    }
                    disabled={!isEditing}
                    className="h-12 rounded-xl bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500 transition-all font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-gray-700 ml-1">
                    Professional Title
                  </Label>
                  <Input
                    value={profileData.title}
                    onChange={(e) =>
                      setProfileData({ ...profileData, title: e.target.value })
                    }
                    disabled={!isEditing}
                    placeholder="e.g. Senior Product Designer"
                    className="h-12 rounded-xl bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500 transition-all font-medium"
                  />
                </div>

                <div className="col-span-1 md:col-span-2 space-y-2">
                  <Label className="text-sm font-bold text-gray-700 ml-1">
                    About You
                  </Label>
                  <Textarea
                    value={profileData.bio}
                    onChange={(e) =>
                      setProfileData({ ...profileData, bio: e.target.value })
                    }
                    disabled={!isEditing}
                    rows={4}
                    placeholder="Tell students about your experience, expertise, and what they can expect from your sessions..."
                    className="min-h-[140px] rounded-2xl bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500 resize-none p-4 transition-all"
                  />
                  <p className="text-right text-xs text-gray-400 font-medium">
                    {profileData.bio?.length || 0} / 500 characters
                  </p>
                </div>

                <div className="bg-gray-50 rounded-2xl p-6 col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 border border-gray-100">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                      Email (Private)
                    </Label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                      <Input
                        value={profileData.email}
                        disabled={true}
                        className="pl-12 h-12 rounded-xl bg-white border-gray-200 text-gray-500 cursor-not-allowed font-medium shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                      Phone (Private)
                    </Label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                      <Input
                        type="tel"
                        value={profileData.phone}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            phone: e.target.value,
                          })
                        }
                        disabled={!isEditing}
                        placeholder="+1 (555) 000-0000"
                        className="pl-12 h-12 rounded-xl bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500 font-medium shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                      Location
                    </Label>
                    <div className="relative group">
                      <MapPin className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 group-hover:text-purple-500 transition-colors" />
                      <Input
                        value={profileData.location}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            location: e.target.value,
                          })
                        }
                        disabled={!isEditing}
                        placeholder="City, Country"
                        className="pl-12 h-12 rounded-xl bg-white border-gray-200 focus:border-purple-500 focus:ring-purple-500 font-medium shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Social Profiles */}
            <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] border border-white/60 shadow-xl shadow-blue-900/5 p-8 sm:p-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-12 w-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center shadow-inner">
                  <Globe className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Social Presence
                  </h3>
                  <p className="text-gray-500 text-sm">
                    Where can students find more about you?
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-gray-700 ml-1">
                    Personal Website
                  </Label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 flex items-center justify-center">
                      <Globe className="h-4 w-4" />
                    </div>
                    <Input
                      type="url"
                      value={profileData.website}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          website: e.target.value,
                        })
                      }
                      disabled={!isEditing}
                      placeholder="https://yourwebsite.com"
                      className="pl-12 h-12 rounded-xl bg-gray-50/50 border-gray-200 focus:bg-white focus:border-pink-500 focus:ring-pink-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-gray-700 ml-1">
                      LinkedIn
                    </Label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#0A66C2] flex items-center justify-center">
                        <Linkedin className="h-4 w-4 fill-current" />
                      </div>
                      <Input
                        type="url"
                        value={profileData.linkedin}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            linkedin: e.target.value,
                          })
                        }
                        disabled={!isEditing}
                        placeholder="linkedin.com/in/username"
                        className="pl-12 h-12 rounded-xl bg-[#0A66C2]/5 border-gray-200 focus:bg-white focus:border-[#0A66C2] focus:ring-[#0A66C2] transition-all font-medium placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-gray-700 ml-1">
                      Twitter / X
                    </Label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black flex items-center justify-center">
                        <Twitter className="h-4 w-4 fill-current" />
                      </div>
                      <Input
                        type="url"
                        value={profileData.twitter}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            twitter: e.target.value,
                          })
                        }
                        disabled={!isEditing}
                        placeholder="twitter.com/username"
                        className="pl-12 h-12 rounded-xl bg-gray-100 border-gray-200 focus:bg-white focus:border-black focus:ring-black transition-all font-medium placeholder:text-gray-400"
                      />
                    </div>
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
