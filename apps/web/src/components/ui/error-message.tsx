import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorMessageProps {
  message: string;
  title?: string;
  variant?: "error" | "warning" | "info";
  className?: string;
  showIcon?: boolean;
}

const iconMap = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const variantStyles = {
  error: "border-red-200 bg-red-50 text-red-600",
  warning: "border-yellow-200 bg-yellow-50 text-yellow-600",
  info: "border-blue-200 bg-blue-50 text-blue-600",
};

export function ErrorMessage({
  message,
  title,
  variant = "error",
  className,
  showIcon = true,
}: ErrorMessageProps) {
  const Icon = iconMap[variant];

  return (
    <Alert
      variant={variant === "error" ? "destructive" : "default"}
      className={cn(variantStyles[variant], className)}
    >
      {showIcon && <Icon className="h-4 w-4" />}
      {title && (
        <AlertTitle className={cn(
          "font-medium",
          variant === "error" && "text-red-600",
          variant === "warning" && "text-yellow-600",
          variant === "info" && "text-blue-600"
        )}>
          {title}
        </AlertTitle>
      )}
      <AlertDescription className={cn(
        "font-medium",
        variant === "error" && "text-red-600",
        variant === "warning" && "text-yellow-600",
        variant === "info" && "text-blue-600"
      )}>
        {message}
      </AlertDescription>
    </Alert>
  );
}

// Convenience components for specific use cases
export function AuthErrorMessage({ message, className }: { message: string; className?: string }) {
  return (
    <ErrorMessage
      message={message}
      title="Authentication Failed"
      variant="error"
      className={className}
    />
  );
}

export function ValidationErrorMessage({ message, className }: { message: string; className?: string }) {
  return (
    <ErrorMessage
      message={message}
      variant="warning"
      className={className}
    />
  );
}

export function InfoMessage({ message, title, className }: { message: string; title?: string; className?: string }) {
  return (
    <ErrorMessage
      message={message}
      title={title}
      variant="info"
      className={className}
    />
  );
}