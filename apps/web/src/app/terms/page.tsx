import type { Metadata } from "next";
import { TermsContent } from "./_components/TermsContent";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "FormMaps terms of service — rules and conditions for using our platform.",
};

export default function TermsOfServicePage() {
  return <TermsContent />;
}
