"use client";

import { useEffect, useState } from "react";

interface Props {
  hasOriginal: boolean;
  loadOriginalUrl: () => Promise<string | null>;
  edited: React.ReactNode;
}

export function ResumePreviewWithToggle({ hasOriginal, loadOriginalUrl, edited }: Props) {
  const [tab, setTab] = useState<"original" | "edited">(hasOriginal ? "original" : "edited");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (hasOriginal && tab === "original" && url === null) {
      loadOriginalUrl().then((u) => {
        if (active) setUrl(u);
      });
    }
    return () => {
      active = false;
    };
  }, [hasOriginal, tab, url, loadOriginalUrl]);

  return (
    <div className="flex flex-col gap-3">
      {hasOriginal && (
        <div role="tablist" className="flex gap-2">
          <button
            role="tab"
            aria-selected={tab === "original"}
            onClick={() => setTab("original")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "original" ? "bg-[#065292] text-white" : "bg-secondary text-foreground"
            }`}
          >
            Original
          </button>
          <button
            role="tab"
            aria-selected={tab === "edited"}
            onClick={() => setTab("edited")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "edited" ? "bg-[#065292] text-white" : "bg-secondary text-foreground"
            }`}
          >
            Edited
          </button>
        </div>
      )}

      {hasOriginal && tab === "original" ? (
        url ? (
          <iframe
            title="Original resume document"
            src={url}
            className="h-[800px] w-full rounded-lg border border-border"
          />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading original…</div>
        )
      ) : (
        <div>{edited}</div>
      )}
    </div>
  );
}
