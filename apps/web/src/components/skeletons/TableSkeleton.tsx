import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  columnCount?: number;
  rowCount?: number;
  showCheckbox?: boolean;
  showActions?: boolean;
}

export function TableSkeleton({
  columnCount = 5,
  rowCount = 10,
  showCheckbox = false,
  showActions = false,
}: TableSkeletonProps) {
  return (
    <div className="w-full bg-white rounded-md border shadow-sm overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckbox && (
              <TableHead className="w-[40px]">
                <Skeleton className="h-4 w-4 rounded" />
              </TableHead>
            )}
            {Array.from({ length: columnCount }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-32" />
              </TableHead>
            ))}
            {showActions && (
              <TableHead className="w-[50px]">
                <Skeleton className="h-4 w-8" />
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRowsSkeleton columnCount={columnCount} rowCount={rowCount} showCheckbox={showCheckbox} showActions={showActions} />
        </TableBody>
      </Table>
    </div>
  );
}

export function TableRowsSkeleton({
  columnCount = 5,
  rowCount = 10,
  showCheckbox = false,
  showActions = false,
}: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, i) => (
        <TableRow key={i}>
          {showCheckbox && (
            <TableCell>
              <Skeleton className="h-4 w-4 rounded" />
            </TableCell>
          )}
          {Array.from({ length: columnCount }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
          {showActions && (
            <TableCell>
              <Skeleton className="h-8 w-8 rounded-full" />
            </TableCell>
          )}
        </TableRow>
      ))}
    </>
  );
}
