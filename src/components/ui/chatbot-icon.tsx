"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type ChatbotIconProps = {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | number;
  className?: string;
  glow?: boolean;
  pulse?: boolean;
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

export function ChatbotIcon({
  size = "md",
  className,
  glow = false,
  pulse = false,
}: ChatbotIconProps) {
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size] ?? 32;

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center shrink-0 select-none",
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
      aria-label="REVORA AI Recovery Copilot"
    >
      {/* Ambient Radial Golden Glow */}
      {glow && (
        <span
          className="pointer-events-none absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#d4a574]/45 via-[#f0c89c]/30 to-[#5dbe8a]/20 blur-md opacity-85"
          style={{ width: pixelSize * 1.35, height: pixelSize * 1.35 }}
        />
      )}

      {/* Subtle Pulse Ring */}
      {pulse && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full border border-revora-amber/40 animate-ping opacity-30"
          style={{ animationDuration: "3s" }}
        />
      )}

      {/* Official AI Chatbot Icon: Glowing Robot with Speech Bubble & Upward Recovery Curve */}
      <Image
        src="/revora-copilot-icon.png"
        alt="Ask REVORA Copilot"
        width={pixelSize}
        height={pixelSize}
        className="relative z-10 rounded-full object-cover drop-shadow-[0_2px_10px_rgba(212,165,116,0.35)]"
        unoptimized
        priority
      />
    </div>
  );
}
