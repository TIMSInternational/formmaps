"use client";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Download, Loader2 } from "lucide-react";
import { useImportJobPolling, triggerFailureDownload } from "@/hooks/useImportJobPolling";

type ImportType = "grades" | "courses";

interface Props {
  type: ImportType;
  jobId: string;
  onDone?: () => void;
}

export default function ImportJobStatusPanel({ type, jobId, onDone }: Props) {
  const { data, isLoading, isError } = useImportJobPolling(type, jobId);

  const status = data?.status ?? "pending";
  const isTerminal = status === "completed" || status === "failed";
  const successCount = data?.successCount ?? 0;
  const failureCount = data?.failureCount ?? 0;
  const totalRows = data?.totalRows ?? 0;

  let progressValue =
    totalRows > 0
      ? Math.round(((successCount + failureCount) / totalRows) * 100)
      : status === "completed"
        ? 100
        : 0;

  if (isNaN(progressValue)) progressValue = 0;

  const StatusIcon = () => {
    if (isLoading || !data) return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
    if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "failed") return <AlertCircle className="h-4 w-4 text-red-500" />;
    return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
  };

  return (
    <div className="mt-4 p-4 rounded-lg border bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon />
          <span className="text-sm font-medium text-gray-700">
            Import Job{" "}
            <span className="font-mono text-xs text-gray-400">#{jobId.slice(-8)}</span>
          </span>
        </div>
        <Badge
          className={`text-xs border-0 capitalize ${status === "completed"
            ? "bg-green-100 text-green-700"
            : status === "failed"
              ? "bg-red-100 text-red-700"
              : status === "processing"
                ? "bg-blue-100 text-blue-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
        >
          {status.replace("_", " ")}
        </Badge>
      </div>

      {/* Progress bar */}
      {!isError && (
        <Progress
          value={progressValue}
          className={`h-2 ${status === "failed" ? "[&>div]:bg-red-500" : ""}`}
        />
      )}

      {/* Counts */}
      {totalRows > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span>Total rows: <strong>{totalRows}</strong></span>
          <span className="text-green-600">✓ {successCount} imported</span>
          {failureCount > 0 && (
            <span className="text-red-600">✗ {failureCount} failed</span>
          )}
        </div>
      )}

      {data?.message && (
        <p className="text-xs text-gray-500">{data.message}</p>
      )}

      {isError && (
        <p className="text-xs text-red-500">Failed to fetch job status. The server may not support polling yet.</p>
      )}

      {/* Actions */}
      {isTerminal && (
        <div className="flex items-center gap-2 pt-1">
          {(data?.failureCount ?? 0) > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="text-xs h-7"
              onClick={() => triggerFailureDownload(type, jobId)}
            >
              <Download className="h-3 w-3 mr-1.5" />
              Download Failures CSV
            </Button>
          )}
          {onDone && (
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={onDone}>
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
