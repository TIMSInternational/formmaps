"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FiAward, FiBookOpen, FiBriefcase, FiTrendingUp, FiArrowUpRight, FiClock, FiStar, FiCalendar, FiUser } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUserProfile, getUserActivity } from "@/services/userService";
import { UserProfile, UserActivity } from "@/types/user";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";

export function ProfileOverview() {
  const { user } = useGlobalStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [profileData, activityData] = await Promise.all([
          getUserProfile(),
          getUserActivity().catch(() => []) // Activity is optional
        ]);
        setProfile(profileData);
        setActivities(activityData.slice(0, 5)); // Only show latest 5
      } catch (error) {
        console.error("Failed to fetch profile overview:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  // Get icon for activity type
  const getActivityIcon = (type: string) => {
    switch (type) {
      case "course_completed": return FiStar;
      case "application_sent": return FiBriefcase;
      case "session_completed": return FiCalendar;
      case "certificate_earned": return FiAward;
      default: return FiUser;
    }
  };

  const getActivityStyle = (type: string) => {
    switch (type) {
      case "course_completed":
        return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-600 dark:text-yellow-400" };
      case "application_sent":
        return { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" };
      case "session_completed":
        return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400" };
      case "certificate_earned":
        return { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400" };
      default:
        return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" };
    }
  };

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  // Use profile data with fallbacks
  const bio = profile?.bio || "";
  const skills = profile?.skills || [];
  const stats = profile?.stats || { coursesCompleted: 0, applicationsSubmitted: 0, mentorshipSessions: 0 };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
      {/* Left Column - Main Details */}
      <div className="lg:col-span-2 space-y-8">

        {/* About Me Card - Hero Style */}
        <motion.div variants={item}>
          <Card className="border-none shadow-lg bg-white dark:bg-gray-900 rounded-3xl overflow-hidden relative group glass-card">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-900/20 rounded-bl-full transition-all group-hover:scale-110" />

            <CardHeader className="relative px-8 pt-8 pb-4 glass-card">
              <CardTitle className="text-2xl font-bold flex items-center gap-2 glass-card">
                About Me <span className="text-2xl">👋</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-8 pb-8 relative z-10 glass-card">
              {bio ? (
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-lg font-light">
                  {bio}
                </p>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-400 italic">No bio added yet.</p>
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link href="/dashboard/profile?tab=edit">Add Bio</Link>
                  </Button>
                </div>
              )}

              {skills.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {skills.map(skill => (
                    <span key={skill} className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              {skills.length === 0 && bio && (
                <div className="mt-6">
                  <p className="text-sm text-gray-400 italic">No skills added yet. <Link href="/dashboard/profile?tab=edit" className="text-blue-600 hover:underline">Add skills</Link></p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Right Column - Stats & Activity */}
      <div className="space-y-8">

        {/* Stats Grid - Glass Cards */}
        <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          {[
            { label: "Courses Completed", value: stats.coursesCompleted.toString(), icon: FiBookOpen, gradient: "from-blue-500 to-cyan-500", text: "text-blue-50" },
            { label: "Applications", value: stats.applicationsSubmitted.toString(), icon: FiBriefcase, gradient: "from-violet-500 to-purple-500", text: "text-purple-50" },
            { label: "Sessions", value: stats.mentorshipSessions.toString(), icon: FiAward, gradient: "from-orange-400 to-pink-500", text: "text-orange-50" },
          ].map((stat, i) => (
            <div key={i} className={cn("relative overflow-hidden rounded-2xl p-6 text-white shadow-lg group transition-all hover:scale-[1.02]", "bg-gradient-to-br " + stat.gradient)}>
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <p className={cn("text-xs font-semibold uppercase tracking-wider mb-1", stat.text)}>{stat.label}</p>
                  <h3 className="text-3xl font-extrabold">{stat.value}</h3>
                </div>
                <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl">
                  <stat.icon size={20} className="text-white" aria-hidden="true" />
                </div>
              </div>
              {/* Decorative circle */}
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
            </div>
          ))}
        </motion.div>

        {/* Recent Activity Timeline - Clean */}
        <motion.div variants={item}>
          <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/20 rounded-3xl glass-card">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center glass-card">
                <FiClock className="mr-2 text-gray-400" aria-hidden="true" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length > 0 ? (
                <div className="space-y-0 relative">
                  {/* Vertical Line */}
                  <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700" />

                  {activities.map((activity, i) => {
                    const Icon = getActivityIcon(activity.type);
                    const style = getActivityStyle(activity.type);
                    const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });

                    return (
                      <div key={activity.id || i} className="flex gap-4 p-3 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-colors relative z-10 group cursor-pointer">
                        <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-gray-50 dark:ring-gray-900", style.bg, style.text)}>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 transition-colors">
                            {activity.description}
                          </h4>
                          <p className="text-xs text-gray-500 truncate">{activity.type.replace(/_/g, " ")}</p>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0 self-start">{timeAgo}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-400 text-sm italic">No recent activity</p>
                </div>
              )}

              {activities.length > 0 && (
                <Button variant="ghost" className="w-full mt-4 text-xs font-semibold text-gray-500 hover:text-gray-900" asChild>
                  <Link href="/dashboard/activity">
                    View All Activity <FiArrowUpRight className="ml-1" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

