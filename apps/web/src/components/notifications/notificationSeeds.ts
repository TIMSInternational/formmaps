export interface SeedNotification {
  id: string;
  title: string;
  description: string;
  type: "career" | "university" | "assessment" | "course" | "coaching" | "system";
  read: boolean;
  createdAt: string;
}

type Translate = (key: string) => string;

/**
 * Seed notifications derived from REAL state — never claim results exist
 * before the student has completed their assessments, and never show
 * student onboarding prompts to other roles.
 */
export function buildSeedNotifications(
  t: Translate,
  isStudent: boolean,
  assessmentsComplete: boolean,
): SeedNotification[] {
  if (!isStudent) return [];
  const now = new Date().toISOString();
  const seeds: SeedNotification[] = [
    {
      id: "welcome",
      title: t("notifications.seed.welcomeTitle"),
      description: t("notifications.seed.welcomeDesc"),
      type: "system",
      read: false,
      createdAt: now,
    },
  ];
  if (assessmentsComplete) {
    seeds.push(
      {
        id: "explore-careers",
        title: t("notifications.seed.careersTitle"),
        description: t("notifications.seed.careersDesc"),
        type: "career",
        read: false,
        createdAt: now,
      },
      {
        id: "university-finder",
        title: t("notifications.seed.universityTitle"),
        description: t("notifications.seed.universityDesc"),
        type: "university",
        read: false,
        createdAt: now,
      },
    );
  }
  seeds.push({
    id: "build-resume",
    title: t("notifications.seed.resumeTitle"),
    description: t("notifications.seed.resumeDesc"),
    type: "course",
    read: false,
    createdAt: now,
  });
  return seeds;
}
