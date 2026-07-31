import { ErrorBoundarySection } from "@/components/ErrorBoundarySection";

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased print:bg-white print:text-black">
      <ErrorBoundarySection>
        {children}
      </ErrorBoundarySection>
    </div>
  );
}
