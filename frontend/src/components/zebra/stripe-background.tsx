"use client";

import { cn } from "@/lib/utils";

interface StripeBackgroundProps {
  className?: string;
  opacity?: number;
  direction?: "horizontal" | "vertical" | "diagonal";
  animate?: boolean;
}

export function StripeBackground({
  className,
  opacity = 0.03,
  direction = "vertical",
  animate = false,
}: StripeBackgroundProps) {
  const gradients = {
    horizontal: "0deg",
    vertical: "90deg",
    diagonal: "45deg",
  };

  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none",
        animate && "animate-stripe",
        className
      )}
      style={{
        opacity,
        backgroundImage: `repeating-linear-gradient(
          ${gradients[direction]},
          transparent,
          transparent 16px,
          currentColor 16px,
          currentColor 32px
        )`,
      }}
    />
  );
}

export function NoiseBackground({
  className,
  opacity = 0.3,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <div
      className={cn("absolute inset-0 pointer-events-none", className)}
      style={{
        opacity,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
      }}
    />
  );
}
