"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * AI essay feedback arrives as Markdown (formmaps#402 showed it as one block of literal
 * `# … ## … **…**`). react-markdown builds React elements and ignores raw HTML by
 * default, so model output cannot inject markup — no raw HTML injection.
 */
export function EssayReviewFeedback({ markdown }: { markdown: string }) {
  return (
    <div className="text-xs leading-relaxed text-[var(--admin-font-secondary)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="text-sm font-semibold mt-1 mb-1.5 text-[var(--admin-font-primary)]">{children}</h3>,
          h2: ({ children }) => <h4 className="text-xs font-semibold mt-3 mb-1 text-[var(--admin-font-primary)]">{children}</h4>,
          h3: ({ children }) => <h5 className="text-xs font-semibold mt-2 mb-1 text-[var(--admin-font-primary)]">{children}</h5>,
          p: ({ children }) => <p className="mb-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-[var(--admin-font-primary)]">{children}</strong>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
