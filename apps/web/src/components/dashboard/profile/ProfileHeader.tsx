"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FiCamera, FiMapPin, FiLink, FiGithub, FiTwitter, FiLinkedin, FiMail } from "react-icons/fi";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadProfileAvatar, uploadProfileCover, getUserProfile } from "@/services/userService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { UserProfile } from "@/types/user";
import { getInitials } from "@/lib/stringUtils";
import Link from "next/link";

export function ProfileHeader() {
  const { user, setUser } = useGlobalStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Fetch user profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      try {
        const data = await getUserProfile();
        setProfile(data);
        if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
        if (data.coverUrl) setCoverUrl(data.coverUrl);
      } catch (error) {
        // Fallback to global store data
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Use profile data or fallback to global store
  const displayName = profile?.fullName || user.name || "User";
  const displayEmail = profile?.email || user.email || "";
  const displayHeadline = profile?.headline || "";
  const displayLocation = profile?.location || "";
  const displayWebsite = profile?.socialLinks?.website || "";
  const displayLinkedin = profile?.socialLinks?.linkedin || "";
  const displayTwitter = profile?.socialLinks?.twitter || "";
  const displayAvatarUrl = avatarUrl || user.avatar || user.image || undefined;


  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const result = await uploadProfileAvatar(file);
      const newAvatarUrl = result.avatarUrl || URL.createObjectURL(file);
      setAvatarUrl(newAvatarUrl);
      // Update global store with new avatar
      setUser({ avatar: newAvatarUrl });
      toast.success("Profile picture updated!");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload profile picture");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be less than 10MB");
      return;
    }

    setIsUploadingCover(true);
    try {
      const result = await uploadProfileCover(file);
      setCoverUrl(result.coverUrl || URL.createObjectURL(file));
      toast.success("Cover image updated!");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload cover image");
    } finally {
      setIsUploadingCover(false);
    }
  };

  return (
    <div className="relative mb-12">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={avatarInputRef}
        onChange={handleAvatarChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={coverInputRef}
        onChange={handleCoverChange}
        accept="image/*"
        className="hidden"
      />

      {/* Cover Image with Mesh Gradient */}
      <div className="h-48 md:h-80 w-full relative group overflow-hidden rounded-b-[3rem] shadow-xl">
        {coverUrl ? (
          <img src={coverUrl} alt="Cover" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-800 to-[#102B47]" />
        )}
        {/* Animated mesh gradient overlay effect */}
        <div className="absolute inset-0 opacity-40 mix-blend-overlay">
          <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
        </div>

        <div className="absolute inset-0 bg-black/20" /> {/* Subtle darkening */}

        <Button
          variant="secondary"
          size="sm"
          className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border-white/20 border transition-all rounded-full px-4"
          onClick={() => coverInputRef.current?.click()}
          disabled={isUploadingCover}
        >
          {isUploadingCover ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FiCamera className="mr-2" aria-hidden="true" />
          )}
          {isUploadingCover ? "Uploading..." : "Edit Cover"}
        </Button>
      </div>

      {/* Profile Info Content */}
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="flex flex-col md:flex-row items-end gap-8 relative z-10 px-4">

          {/* Avatar Area - Overlaps Banner */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative shrink-0 -mt-16 md:-mt-24"
          >
            <div className="p-1.5 bg-white dark:bg-gray-950 rounded-full shadow-2xl">
              <Avatar className="h-32 w-32 md:h-48 md:w-48 border-4 border-white dark:border-gray-900 relative bg-gray-100">
                <AvatarImage src={displayAvatarUrl} className="object-cover" alt={displayName} />
                <AvatarFallback className="text-4xl bg-gradient-to-br from-indigo-100 to-white text-indigo-600">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
            </div>
            <button
              className="absolute bottom-4 right-4 p-3 bg-[#2E9098] text-white rounded-full shadow-lg hover:bg-[#2E9098]/90 transition-all border-2 border-white dark:border-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Change profile picture"
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
            >
              {isUploadingAvatar ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <FiCamera size={18} aria-hidden="true" />
              )}
            </button>
          </motion.div>

          {/* User Details - Sits BELOW Banner (Black text on White) */}
          <div className="flex-1 w-full pb-2 md:pb-6 pt-4">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col lg:flex-row lg:justify-between items-start lg:items-end gap-6"
            >
              <div className="space-y-2">
                <div>
                  <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                    {isLoading ? (
                      <Skeleton className="h-12 w-48 rounded" />
                    ) : (
                      displayName
                    )}
                  </h1>
                  {displayHeadline && (
                    <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 font-medium">
                      {displayHeadline}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400 font-medium pt-1">
                  {displayLocation && (
                    <span className="flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">
                      <FiMapPin className="mr-2 text-gray-700 dark:text-gray-300" aria-hidden="true" /> {displayLocation}
                    </span>
                  )}
                  {displayWebsite && (
                    <a href={displayWebsite.startsWith("http") ? displayWebsite : `https://${displayWebsite}`} target="_blank" rel="noopener noreferrer" className="flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                      <FiLink className="mr-2 text-gray-700 dark:text-gray-300" aria-hidden="true" /> {displayWebsite.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {displayEmail && (
                    <span className="flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">
                      <FiMail className="mr-2 text-gray-700 dark:text-gray-300" aria-hidden="true" /> {displayEmail}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-4 lg:mt-0 w-full lg:w-auto">
                <Button asChild className="flex-1 lg:flex-none bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 rounded-xl px-6 h-11 font-semibold shadow-lg shadow-gray-200 dark:shadow-none">
                  <Link href="/dashboard/profile?tab=edit">Edit Profile</Link>
                </Button>
                {displayLinkedin && (
                  <Button variant="outline" asChild className="flex-1 lg:flex-none border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl h-11 w-11 p-0 flex items-center justify-center">
                    <a href={displayLinkedin.startsWith("http") ? displayLinkedin : `https://${displayLinkedin}`} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn Profile">
                      <FiLinkedin size={20} className="text-blue-700" aria-hidden="true" />
                    </a>
                  </Button>
                )}
                {displayTwitter && (
                  <Button variant="outline" asChild className="flex-1 lg:flex-none border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl h-11 w-11 p-0 flex items-center justify-center">
                    <a href={displayTwitter.startsWith("http") ? displayTwitter : `https://${displayTwitter}`} target="_blank" rel="noopener noreferrer" aria-label="Twitter Profile">
                      <FiTwitter size={20} className="text-blue-400" aria-hidden="true" />
                    </a>
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

