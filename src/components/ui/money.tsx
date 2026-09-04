"use client";

import { cn, formatINR } from "@/lib/utils";
import { useEffect, useState } from "react";

export function Money({
  paise,
  className,
  size = "md",
}: {
  paise: number;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(paise);
      return;
    }
    const start = performance.now();
    const from = display;
    const duration = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (paise - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paise]);

  const sizes = {
    sm: "text-sm",
    md: "text-xl",
    lg: "text-3xl",
    xl: "text-4xl md:text-5xl",
  };

  return (
    <span className={cn("font-medium tabular-nums tracking-tight", sizes[size], className)}>
      {formatINR(display)}
    </span>
  );
}
