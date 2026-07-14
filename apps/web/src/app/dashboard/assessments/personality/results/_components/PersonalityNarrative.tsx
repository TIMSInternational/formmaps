"use client";

/**
 * Narrative sections of the personality profile. All copy is already localized
 * by the API for the session language — this only renders it (never translated
 * via i18next). Section HEADINGS are chrome and come from i18n.
 */
import { useTranslation } from "react-i18next";
import type { LocalizedProfile } from "@/services/personalityService";

function Prose({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <section className="dash-card p-5">
      <h3 className="text-sm font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{text}</p>
    </section>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="dash-card p-5">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#065292]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PersonalityNarrative({ profile }: { profile: LocalizedProfile }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Prose title={t("personality.sectionDescription")} text={profile.description} />
      <BulletList title={t("personality.sectionStrengths")} items={profile.strengths} />
      <BulletList title={t("personality.sectionWeaknesses")} items={profile.weaknesses} />
      <BulletList title={t("personality.sectionImprovementAreas")} items={profile.improvementAreas} />
      <BulletList title={t("personality.sectionHowToDevelop")} items={profile.howToDevelop} />
      <BulletList title={t("personality.sectionMotivation")} items={profile.motivation} />
      <BulletList title={t("personality.sectionHowToWorkWith")} items={profile.howToWorkWith} />
      <BulletList title={t("personality.sectionCommunication")} items={profile.communication} />

      {(profile.potential?.social || profile.potential?.laboral) && (
        <section className="dash-card p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">{t("personality.sectionPotential")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {profile.potential.social && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#065292] mb-1">
                  {t("personality.potentialSocial")}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">{profile.potential.social}</p>
              </div>
            )}
            {profile.potential.laboral && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#065292] mb-1">
                  {t("personality.potentialLaboral")}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">{profile.potential.laboral}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {(profile.coachingStrategy?.objective || profile.coachingStrategy?.practices?.length > 0) && (
        <section className="dash-card p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">{t("personality.sectionCoachingStrategy")}</h3>
          {profile.coachingStrategy.objective && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{profile.coachingStrategy.objective}</p>
          )}
          {profile.coachingStrategy.practices?.length > 0 && (
            <ul className="space-y-2">
              {profile.coachingStrategy.practices.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#065292]" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
