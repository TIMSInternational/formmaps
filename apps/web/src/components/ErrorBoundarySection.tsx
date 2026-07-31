"use client";

import React, { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundarySection extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-xl"
          style={{
            background: "var(--admin-bg-card, var(--card))",
            border: "1px solid var(--admin-border-default, var(--border))",
          }}
        >
          <div
            className="flex items-center justify-center rounded-full mb-3"
            style={{
              width: 48,
              height: 48,
              background: "var(--admin-accent-bg-red, rgba(239,68,68,0.1))",
            }}
          >
            <AlertCircle className="h-5 w-5" style={{ color: "var(--admin-accent-red, #ef4444)" }} />
          </div>
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--admin-font-primary, var(--foreground))" }}
          >
            {this.props.fallbackTitle || "Something went wrong"}
          </h3>
          <p
            className="text-xs mb-4 max-w-xs"
            style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}
          >
            This section encountered an error. Try refreshing.
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: "var(--admin-bg-hover, var(--secondary))",
              color: "var(--admin-font-primary, var(--foreground))",
              border: "1px solid var(--admin-border-default, var(--border))",
            }}
          >
            <RefreshCw className="h-3 w-3" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
