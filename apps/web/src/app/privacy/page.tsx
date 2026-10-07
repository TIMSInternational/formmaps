import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "FormMaps privacy policy — how we collect, use, share and protect personal data, including students' data.",
};

export default function Page() {
  return <LegalDocumentView docKey="privacy" />;
}
