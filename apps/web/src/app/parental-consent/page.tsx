import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Parental Consent",
  description: "What a parent or guardian authorizes when a student aged 13 to 17 uses FormMaps.",
};

export default function Page() {
  return <LegalDocumentView docKey="parental-consent" />;
}
