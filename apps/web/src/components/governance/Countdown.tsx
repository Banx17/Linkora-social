"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/governance";

interface CountdownProps {
  deadlineAt: number;
  className?: string;
}

/**
 * Live, minute/second-resolution deadline countdown. The interval is cleared on
 * unmount and the initial render is suppressed from hydration warnings because
 * the server and client clocks can differ by a few milliseconds.
 */
export function Countdown({ deadlineAt, className }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadlineAt <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);

  return (
    <span className={className} role="timer" suppressHydrationWarning>
      {formatCountdown(deadlineAt, now)}
    </span>
  );
}
