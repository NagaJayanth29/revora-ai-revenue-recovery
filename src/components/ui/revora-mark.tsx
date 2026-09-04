"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type RevoraMarkProps = {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | number;
  className?: string;
  pulse?: boolean;
  glow?: boolean;
  variant?: "icon" | "brand";
};

const SIZE_MAP = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
  "2xl": 56,
  "3xl": 64,
};

export function RevoraMark({
  size = "md",
  className,
  pulse = false,
  glow = false,
  variant = "icon",
}: RevoraMarkProps) {
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size] ?? 32;

  if (variant === "brand") {
    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center shrink-0 select-none",
          className
        )}
        style={{ width: pixelSize * 2.2, height: pixelSize }}
      >
        {glow && (
          <span className="pointer-events-none absolute -inset-2 rounded-2xl bg-revora-amber/20 blur-xl opacity-60" />
        )}
        <Image
          src="/revora-brand-clean.png"
          alt="REVORA AI Revenue Recovery"
          width={pixelSize * 2.2}
          height={pixelSize}
          className="relative z-10 object-contain"
          unoptimized
          priority
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center shrink-0 select-none",
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
      aria-label="REVORA AI Revenue Recovery"
    >
      {/* Ambient Radial Luminous Glow */}
      {glow && (
        <span
          className="pointer-events-none absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#d4a574]/45 via-[#f0c89c]/25 to-[#5dbe8a]/20 blur-md opacity-85"
          style={{ width: pixelSize * 1.35, height: pixelSize * 1.35 }}
        />
      )}

      {/* Breathing Ambient Pulse Ring */}
      {pulse && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full border border-revora-amber/40 animate-ping opacity-30"
          style={{ animationDuration: "3s" }}
        />
      )}

      {/* Official Metallic Gold Emblem with Luminous Ring */}
      <Image
        src="/revora-icon.png"
        alt="REVORA Mark"
        width={pixelSize}
        height={pixelSize}
        className="relative z-10 rounded-full object-cover drop-shadow-[0_2px_10px_rgba(212,165,116,0.3)]"
        unoptimized
        priority
      />
    </div>
  );
}

