import type { Metadata } from "next";
import { PrivacyContent } from "./_components/PrivacyContent";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "FormMaps privacy policy — how we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
  return <PrivacyContent />;
}
