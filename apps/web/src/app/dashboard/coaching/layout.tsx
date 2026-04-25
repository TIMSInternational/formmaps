import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function CoachingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
