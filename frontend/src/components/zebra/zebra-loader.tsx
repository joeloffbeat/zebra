"use client";

import { cn } from "@/lib/utils";

interface ZebraLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ZebraLoader({ className, size = "md" }: ZebraLoaderProps) {
  const heights = {
    sm: "h-px",
    md: "h-0.5",
    lg: "h-1",
  };

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-background",
        heights[size],
        className
      )}
    >
      <div
        className="absolute inset-0 animate-stripe"
        style={{
          backgroundImage: `repeating-linear-gradient(
            90deg,
            hsl(var(--foreground)) 0px,
            hsl(var(--foreground)) 16px,
            hsl(var(--background)) 16px,
            hsl(var(--background)) 32px
          )`,
          backgroundSize: "64px 100%",
        }}
      />
    </div>
  );
}

export function ZebraLoaderCircle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-8 w-8 border border-current border-t-transparent animate-spin",
        className
      )}
    />
  );
}

export function ZebraLoaderDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-1.5 w-1.5 bg-current animate-pulse"
          style={{
            animationDelay: `${i * 200}ms`,
          }}
        />
      ))}
    </div>
  );
}

