"use client";

import { use } from "react";
import { InviteOnboarding } from "../../_components/InviteOnboarding";

export default function InviteOnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <InviteOnboarding token={token} />;
}
