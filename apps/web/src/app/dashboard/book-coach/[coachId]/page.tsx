"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  MapPin,
  Clock,
  Calendar,
  MessageSquare,
  Share2,
  Globe,
  Languages,
  Shield,
  Award,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { DynamicBookingModal } from "@/lib/dynamic-imports";
import { useParams, useRouter } from "next/navigation";
import { Coach } from "@/types/coach";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export default function CoachProfilePage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const coachId = params.coachId as string;

  const [coach, setCoach] = useState<Coach | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  useEffect(() => {
    const fetchCoachDetails = async () => {
      if (!coachId) return;
      try {
        const { getCoachDetails } = await import("@/services/coachService");
        const data = await getCoachDetails(coachId);
        setCoach(data);
      } catch (error) {
      // error handled silently
    } finally {
        setIsLoading(false);
      }
    };

    fetchCoachDetails();
  }, [coachId]);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-8 pb-12 animate-pulse">
        <div className="h-64 bg-gray-200 rounded-3xl"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="h-40 bg-gray-200 rounded-2xl"></div>
            <div className="h-40 bg-gray-200 rounded-2xl"></div>
          </div>
          <div className="h-60 bg-gray-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {t("coaching.profile.notFoundTitle")}
        </h2>
        <p className="text-gray-500 mt-2">
          {t("coaching.profile.notFoundText")}
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => router.back()}
        >
          {t("coaching.profile.goBack")}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-12 px-4 sm:px-6">
      {/* Navigation */}
      <button
        onClick={() => router.back()}
        className="group flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
        {t("coaching.profile.backToCoaches")}
      </button>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-8"
      >
        <div className="h-64 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10"></div>
          <div className="absolute top-6 right-6 flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-md transition-all"
            >
              <Share2 className="h-4 w-4 mr-2" /> Share Profile
            </Button>
          </div>
        </div>

        <div className="px-8 pb-8 relative">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="-mt-20 relative">
              <div className="p-1.5 bg-white rounded-2xl shadow-xl">
                <Avatar className="h-40 w-40 rounded-xl">
                  <AvatarImage
                    src={coach.image || ""}
                    alt={coach.name}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-4xl bg-gray-50 text-gray-400 rounded-xl">
                    {coach.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="absolute -bottom-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full border-4 border-white shadow-sm flex items-center gap-1">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                {t("coaching.profile.available")}
              </div>
            </div>

            <div className="flex-1 pt-4 md:pt-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    {coach.name}
                  </h1>
                  <p className="text-lg text-blue-600 font-medium mt-1">
                    {coach.title}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    size="lg"
                    className="bg-gray-900 hover:bg-gray-800 text-white shadow-lg shadow-gray-900/20"
                    onClick={() => setIsBookingModalOpen(true)}
                  >
                    {t("coaching.profile.bookSession")}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-yellow-50 rounded-lg">
                    <Star className="h-4 w-4 text-yellow-600 fill-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {coach.rating || "New"}
                    </p>
                    <p className="text-xs text-gray-500">Rating</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <MapPin className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {coach.location}
                    </p>
                    <p className="text-xs text-gray-500">Location</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <Globe className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {coach.languages?.join(", ")}
                    </p>
                    <p className="text-xs text-gray-500">Languages</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* About */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 rounded-xl">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {t("coaching.profile.about")}
              </h2>
            </div>
            <div className="prose prose-gray max-w-none text-gray-600 leading-relaxed">
              <p>{coach.bio}</p>
            </div>
          </motion.section>

          {/* Specialization & Skills */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-purple-50 rounded-xl">
                <Award className="w-5 h-5 text-purple-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {t("coaching.profile.expertise")}
              </h2>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {t("coaching.profile.coreSpecialization")}
                </h3>
                <div className="flex flex-wrap gap-3">
                  <Badge className="text-base py-2 px-4 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100 rounded-xl">
                    {coach.specialization}
                  </Badge>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Topics & Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {coach.tags?.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 border-transparent rounded-lg"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 sticky top-6"
          >
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-900" />
              {t("coaching.profile.availability")}
            </h3>

            <div className="bg-gray-50 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white rounded-xl shadow-sm">
                  <Clock className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">
                    {t("coaching.profile.nextAvailable")}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {t("coaching.profile.slotsToday")}
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl shadow-lg shadow-blue-600/20 font-medium"
              onClick={() => setIsBookingModalOpen(true)}
            >
              {t("coaching.profile.checkCalendar")}
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>

            <p className="text-xs text-center text-gray-400 mt-4">
              {t("coaching.profile.freeCancellation")}
            </p>
          </motion.div>
        </div>
      </div>

      <DynamicBookingModal
        coach={coach}
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
      />
    </div>
  );
}
