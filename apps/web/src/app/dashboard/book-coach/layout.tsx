import { ErrorBoundarySection } from "@/components/ErrorBoundarySection";

export default function BookCoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundarySection>{children}</ErrorBoundarySection>;
}
