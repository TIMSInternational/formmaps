import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Cookie Notice",
  description: "The cookies and browser storage FormMaps uses and how to manage them.",
};

export default function Page() {
  return <LegalDocumentView docKey="cookies" />;
}
