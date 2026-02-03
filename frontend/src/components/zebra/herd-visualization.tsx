"use client";

import { cn } from "@/lib/utils";

interface HerdVisualizationProps {
  orderCount: number;
  className?: string;
}

export function HerdVisualization({
  orderCount,
  className,
}: HerdVisualizationProps) {
  return (
    <div
      className={cn(
        "relative w-full h-[500px] overflow-hidden",
        className
      )}
    >
      {/* VIDEO BACKGROUND */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="/herd.mp4"
        autoPlay
        loop
        muted
        playsInline
      />

      {/* BLUR OVERLAY */}
      <div className="absolute inset-0 backdrop-blur-sm bg-background/60" />

      {/* OVERLAY TEXT */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-3xl">{orderCount}</p>
          <p className="text-[10px] tracking-widest text-muted-foreground mt-1">
            ORDERS HIDDEN
          </p>
        </div>
      </div>
    </div>
  );
}

export function HerdStats({
  orderCount,
  volume24h,
  spread,
  className,
}: {
  orderCount: number;
  volume24h: string;
  spread: string;
  className?: string;
}) {
  return (
    <div className={cn("border border-border", className)}>
      <div className="p-4 border-b border-border">
        <p className="text-xs tracking-widest text-muted-foreground">
          THE HERD
        </p>
      </div>

      <HerdVisualization orderCount={orderCount} />

      <div className="p-4 space-y-4 border-t border-border">
        <div className="flex justify-between items-baseline">
          <span className="text-xs tracking-widest text-muted-foreground">
            24H VOLUME
          </span>
          <span className="font-mono text-sm">{volume24h}</span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="text-xs tracking-widest text-muted-foreground">
            EST. SPREAD
          </span>
          <span className="font-mono text-sm">{spread}</span>
        </div>
      </div>
    </div>
  );
}
