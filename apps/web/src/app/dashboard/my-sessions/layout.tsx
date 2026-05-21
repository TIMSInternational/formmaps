import { ErrorBoundarySection } from "@/components/ErrorBoundarySection";

export default function MySessionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundarySection>{children}</ErrorBoundarySection>;
}
