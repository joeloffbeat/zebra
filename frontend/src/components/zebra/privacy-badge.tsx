"use client";

import { cn } from "@/lib/utils";

interface PrivacyBadgeProps {
  className?: string;
  status?: "hidden" | "revealed" | "matched";
}

export function PrivacyBadge({
  className,
  status = "hidden",
}: PrivacyBadgeProps) {
  const statusConfig = {
    hidden: {
      label: "HIDDEN",
      animate: true,
    },
    revealed: {
      label: "REVEALED",
      animate: false,
    },
    matched: {
      label: "MATCHED",
      animate: false,
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 text-xs tracking-widest",
        className
      )}
    >
      <div
        className={cn(
          "h-1.5 w-1.5 bg-current",
          config.animate && "animate-pulse"
        )}
      />
      <span>{config.label}</span>
    </div>
  );
}
