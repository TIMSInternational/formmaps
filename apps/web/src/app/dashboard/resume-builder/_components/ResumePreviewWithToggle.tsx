"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  hasOriginal: boolean;
  loadOriginalUrl: () => Promise<string | null>;
  edited: React.ReactNode;
}

export function ResumePreviewWithToggle({ hasOriginal, loadOriginalUrl, edited }: Props) {
  const [tab, setTab] = useState<"original" | "edited">(hasOriginal ? "original" : "edited");
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  // Track whether we've already started a fetch so the effect doesn't re-fire
  // on the re-render caused by setState("loading") inside the effect itself.
  const fetchStarted = useRef(false);
  // Whether the user has manually chosen a tab — once they have, we stop
  // auto-defaulting so we don't yank them off their selection.
  const userPicked = useRef(false);

  // `hasOriginal` arrives asynchronously (the resume loads after mount), so the
  // initial useState above sees `false` and would open on the templated "Edited"
  // view. When an original exists, default to showing the document in the format
  // it was uploaded as ("Original") — unless the user has already picked a tab.
  useEffect(() => {
    if (!userPicked.current) setTab(hasOriginal ? "original" : "edited");
  }, [hasOriginal]);

  useEffect(() => {
    if (!hasOriginal || tab !== "original" || fetchStarted.current) return;
    fetchStarted.current = true;
    setState("loading");
    let active = true;
    loadOriginalUrl()
      .then((u) => {
        if (!active) return;
        if (u) {
          setUrl(u);
          setState("loaded");
        } else {
          setState("error");
        }
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [hasOriginal, tab, loadOriginalUrl]);

  const tabBtn = (key: "original" | "edited", label: string) => (
    <button
      role="tab"
      aria-selected={tab === key}
      onClick={() => {
        userPicked.current = true;
        setTab(key);
      }}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        tab === key ? "bg-[#065292] text-white" : "bg-secondary text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {hasOriginal && (
        <div role="tablist" className="flex gap-2">
          {tabBtn("original", "Original")}
          {tabBtn("edited", "Edited")}
        </div>
      )}

      {hasOriginal && tab === "original" ? (
        state === "loaded" && url ? (
          <iframe
            title="Original resume document"
            src={url}
            className="h-[800px] w-full rounded-lg border border-border"
          />
        ) : state === "error" ? (
          <div className="flex flex-col items-start gap-2 p-6 text-sm text-muted-foreground">
            <span>Couldn&apos;t load the original document.</span>
            <button
              onClick={() => {
                userPicked.current = true;
                setTab("edited");
              }}
              className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-foreground"
            >
              View edited version
            </button>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading original…</div>
        )
      ) : (
        <div>{edited}</div>
      )}
    </div>
  );
}
