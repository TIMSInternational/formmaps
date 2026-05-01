import { toast as sonnerToast } from "sonner";

interface ToastOptions {
  duration?: number;
  action?: { label: string; onClick: () => void };
  description?: string;
}

function success(message: string, opts?: ToastOptions) {
  sonnerToast.success(message, {
    duration: opts?.duration ?? 4000,
    description: opts?.description,
    action: opts?.action
      ? { label: opts.action.label, onClick: opts.action.onClick }
      : undefined,
  });
}

function error(message: string, opts?: ToastOptions) {
  sonnerToast.error(message, {
    duration: opts?.duration ?? 6000,
    description: opts?.description,
    action: opts?.action
      ? { label: opts.action.label, onClick: opts.action.onClick }
      : undefined,
  });
}

function warning(message: string, opts?: ToastOptions) {
  sonnerToast.warning(message, {
    duration: opts?.duration ?? 5000,
    description: opts?.description,
    action: opts?.action
      ? { label: opts.action.label, onClick: opts.action.onClick }
      : undefined,
  });
}

function info(message: string, opts?: ToastOptions) {
  sonnerToast.info(message, {
    duration: opts?.duration ?? 4000,
    description: opts?.description,
    action: opts?.action
      ? { label: opts.action.label, onClick: opts.action.onClick }
      : undefined,
  });
}

export const toast = { success, error, warning, info };

export function useToast() {
  return { toast };
}
