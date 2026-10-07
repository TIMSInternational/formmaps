import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "FormMaps Terms of Service — the agreement for using FormMaps, including payment terms.",
};

export default function Page() {
  return <LegalDocumentView docKey="terms" />;
}
