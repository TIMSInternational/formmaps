"use client";

/**
 * Personality results — resolved type + alias + tagline hero, a radar over the
 * 4 dimensions, per-dimension intensity bars, and the full narrative profile.
 * All profile copy is localized by the API for the session language.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, Printer, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { personalityApi, type PersonalityResults } from "@/services/personalityService";
import { PersonalityRadar } from "./_components/PersonalityRadar";
import { PersonalityIntensityBars } from "./_components/PersonalityIntensityBars";
import { PersonalityNarrative } from "./_components/PersonalityNarrative";

export default function PersonalityResultsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language: storeLanguage, user } = useGlobalStore();
  const language: "es" | "en" = storeLanguage === "english" ? "en" : "es";

  const [results, setResults] = useState<PersonalityResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user.id) return;
    let cancelled = false;
    personalityApi
      .getUserResults(user.id)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#065292] animate-spin" />
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-sm p-8 text-center">
          <AlertTriangle className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">{t("personality.noResultsTitle")}</h1>
          <p className="text-muted-foreground mb-6">{t("personality.noResultsBody")}</p>
          <button
            onClick={() => router.push("/dashboard/assessments/personality")}
            className="px-6 py-3 bg-[#065292] hover:bg-[#054275] text-white font-semibold rounded-xl transition-colors"
          >
            {t("personality.goToAssessment")}
          </button>
        </div>
      </div>
    );
  }

  const { profile, dimension_scores } = results;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/dashboard/assessments")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            {t("personality.back")}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-xl hover:bg-secondary/50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            {t("personality.print")}
          </button>
        </div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-[#065292] text-white p-8 text-center mb-6"
        >
          <div className="inline-flex items-center gap-1.5 text-[#FFD600] text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            {profile.type}
          </div>
          <h1 className="text-3xl font-bold mb-1">{profile.alias}</h1>
          <p className="text-white/80 text-base max-w-lg mx-auto">{profile.tagline}</p>
        </motion.div>

        {/* Radar + intensity bars */}
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <div className="dash-card p-5">
            <h2 className="text-sm font-bold text-foreground mb-2">{t("personality.dimensionProfile")}</h2>
            <PersonalityRadar dimensions={dimension_scores} />
          </div>
          <div className="dash-card p-5">
            <h2 className="text-sm font-bold text-foreground mb-4">{t("personality.intensityByDimension")}</h2>
            <PersonalityIntensityBars dimensions={dimension_scores} />
          </div>
        </div>

        {/* Narrative */}
        <PersonalityNarrative profile={profile} />

        <p className="text-center text-xs text-muted-foreground mt-8">
          {language === "es"
            ? "Perfil de personalidad — FormMaps"
            : "Personality profile — FormMaps"}
        </p>
      </div>
    </div>
  );
}
