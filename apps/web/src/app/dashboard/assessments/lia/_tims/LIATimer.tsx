"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
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

  // Callbacks live in refs so the ticking interval never restarts when the
  // parent re-renders (answering a question hands us fresh function
  // identities on every render — restarting a 1s interval faster than once
  // per second means it never fires and the clock freezes on screen).
  const onTimeoutRef = useRef(onTimeout);
  const onWarningRef = useRef(onWarning);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
    onWarningRef.current = onWarning;
  });

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Which subtest (keyed by its start timestamp) already fired onTimeout.
  // A ref (not an effect-local) so StrictMode's dev-only effect remount can't
  // double-fire onTimeout when mounting onto an already-expired subtest;
  // a new subtest gets a new startedAt and is allowed to fire again.
  const timedOutForRef = useRef<number | null>(null);

  useEffect(() => {
    // Single stable interval per subtest, anchored to the server-provided
    // start timestamp. Warned flags are locals of this effect run: they
    // reset only when the subtest itself changes.
    let warned30 = false;
    let warned10 = false;
    const timeoutKey = startedAt.getTime();

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
      setSecondsRemaining(remaining);

      if (remaining <= 30 && remaining > 10 && !warned30) {
        warned30 = true;
        onWarningRef.current?.(30);
      }
      if (remaining <= 10 && remaining > 0 && !warned10) {
        warned10 = true;
        onWarningRef.current?.(10);
      }

      if (remaining === 0) {
        clearInterval(interval);
        if (timedOutForRef.current !== timeoutKey) {
          timedOutForRef.current = timeoutKey;
          onTimeoutRef.current();
        }
      }
    };

    // 250ms keeps the displayed second accurate against wall-clock drift;
    // React bails out of re-rendering when the computed value is unchanged.
    const interval = setInterval(tick, 250);
    tick();

    return () => clearInterval(interval);
  }, [startedAt, totalSeconds]);

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
  // onClose via ref: parents pass inline arrows, and re-creating the timeout
  // on every parent re-render would keep the toast alive indefinitely while
  // the candidate answers quickly.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const timeout = setTimeout(() => onCloseRef.current(), 3000);
    return () => clearTimeout(timeout);
  }, []);

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
