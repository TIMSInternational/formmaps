"use client";

import { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';

interface LIATimerProps {
  totalSeconds: number;
  startedAt: Date;
  onTimeout: () => void;
  onWarning?: (secondsLeft: number) => void;
}

export function LIATimer({ totalSeconds, startedAt, onTimeout, onWarning }: LIATimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    return Math.max(0, totalSeconds - elapsed);
  });

  const [warned30, setWarned30] = useState(false);
  const [warned10, setWarned10] = useState(false);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
      setSecondsRemaining(remaining);

      // Check warnings
      if (remaining <= 30 && remaining > 10 && !warned30) {
        setWarned30(true);
        onWarning?.(30);
      }
      if (remaining <= 10 && remaining > 0 && !warned10) {
        setWarned10(true);
        onWarning?.(10);
      }

      // Check timeout
      if (remaining === 0) {
        clearInterval(interval);
        onTimeout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, totalSeconds, onTimeout, onWarning, warned30, warned10]);

  // Determine color based on time remaining
  const getTimerColor = () => {
    if (secondsRemaining <= 10) return 'text-red-600 bg-red-100 dark:bg-red-900/30';
    if (secondsRemaining <= 30) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30';
    return 'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-800';
  };

  // Pulse animation for last 10 seconds
  const getPulseClass = () => {
    if (secondsRemaining <= 10 && secondsRemaining > 0) {
      return 'animate-pulse';
    }
    return '';
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-semibold ${getTimerColor()} ${getPulseClass()}`}
    >
      <Clock className="w-5 h-5" />
      <span>{formatTime(secondsRemaining)}</span>
    </div>
  );
}

// Warning Toast Component
interface TimerWarningToastProps {
  secondsLeft: number;
  onClose: () => void;
}

export function TimerWarningToast({ secondsLeft, onClose }: TimerWarningToastProps) {
  useEffect(() => {
    const timeout = setTimeout(onClose, 3000);
    return () => clearTimeout(timeout);
  }, [onClose]);

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
      <div
        className={`px-6 py-3 rounded-lg shadow-lg font-semibold text-white ${
          secondsLeft <= 10 ? 'bg-red-600' : 'bg-orange-500'
        }`}
      >
        {secondsLeft === 30 && '¡30 segundos restantes!'}
        {secondsLeft === 10 && '¡10 segundos! Responde rápido.'}
      </div>
    </div>
  );
}
