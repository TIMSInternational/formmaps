import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "How FormMaps free trials, cancellations and refunds work.",
};

export default function Page() {
  return <LegalDocumentView docKey="refunds" />;
}
