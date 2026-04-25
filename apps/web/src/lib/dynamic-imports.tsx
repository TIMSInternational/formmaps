import dynamic from "next/dynamic";
import {
  ChartSkeleton,
  DocumentSkeleton,
  ModalSkeleton,
} from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dynamically imported TimelinePDF component
 * This is a heavy component that should only load when needed
 */
export const DynamicTimelinePDF = dynamic(
  () => import("@/components/pdf/TimelinePDF").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <DocumentSkeleton />,
  }
);

/**
 * Dynamically imported Recharts components
 * These are heavy and should be lazy loaded
 */
export const DynamicAreaChart = dynamic(
  () => import("recharts").then((mod) => mod.AreaChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

export const DynamicBarChart = dynamic(
  () => import("recharts").then((mod) => mod.BarChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

export const DynamicLineChart = dynamic(
  () => import("recharts").then((mod) => mod.LineChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

export const DynamicPieChart = dynamic(
  () => import("recharts").then((mod) => mod.PieChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

export const DynamicRadarChart = dynamic(
  () => import("recharts").then((mod) => mod.RadarChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

/**
 * Dynamically imported Lottie component
 */
export const DynamicLottie = dynamic(() => import("react-lottie"), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-32 rounded-lg" />,
});

/**
 * Dynamically imported ContentGenerationModal
 * AI modals are heavy and should load on demand
 */
export const DynamicContentGenerationModal = dynamic(
  () =>
    import("@/components/ai/ContentGenerationModal").then(
      (mod) => mod.ContentGenerationModal
    ),
  {
    ssr: false,
    loading: () => <ModalSkeleton />,
  }
);

/**
 * Dynamically imported BookingModal
 */
export const DynamicBookingModal = dynamic(
  () =>
    import("@/components/coaching/BookingModal").then(
      (mod) => mod.BookingModal
    ),
  {
    ssr: false,
    loading: () => <ModalSkeleton />,
  }
);

/**
 * Dynamically imported Stripe components
 */
export const DynamicStripeCheckout = dynamic(
  () => import("@/components/StripeCheckout"),
  {
    ssr: false,
    loading: () => <Skeleton className="w-full h-48 rounded-lg" />,
  }
);
