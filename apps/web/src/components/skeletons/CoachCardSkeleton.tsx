import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export function CoachCardSkeleton() {
  return (
    <Card className="overflow-hidden flex flex-col h-full border-gray-200">
      {/* Banner & Avatar Area */}
      <div className="h-24 bg-gray-100 relative">
        <Skeleton className="absolute -bottom-10 left-6 h-20 w-20 rounded-full border-4 border-white" variant="circle" />
      </div>

      <CardContent className="pt-12 pb-4 flex-1 space-y-4">
        {/* Name & Rating */}
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-6 w-12 rounded" />
        </div>

        {/* Location & Tags */}
        <div className="space-y-3 pt-2">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </CardContent>

      <CardFooter className="border-t bg-gray-50/50 p-4">
        <Skeleton className="h-10 w-full rounded-md" />
      </CardFooter>
    </Card>
  );
}
