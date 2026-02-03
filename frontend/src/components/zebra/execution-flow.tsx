"use client";

import { cn } from "@/lib/utils";

interface ExecutionFlowProps {
  step: 1 | 2 | 3;
  className?: string;
}

export function ExecutionFlow({ step, className }: ExecutionFlowProps) {
  const steps = [
    { label: "MATCH", number: 1 },
    { label: "VERIFY", number: 2 },
    { label: "SETTLE", number: 3 },
  ];

  return (
    <div className={cn("flex items-center justify-between", className)}>
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center flex-1">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "h-8 w-8 border border-border flex items-center justify-center",
                "text-xs transition-colors",
                s.number <= step
                  ? "bg-foreground text-background"
                  : "bg-transparent"
              )}
            >
              {s.number}
            </div>
            <span className="text-[10px] tracking-widest">
              {s.label}
            </span>
          </div>

          {i < steps.length - 1 && (
            <div
              className={cn(
                "flex-1 h-px mx-2",
                s.number < step ? "bg-foreground" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({
  progress,
  label,
  className,
}: {
  progress: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="relative h-1 w-full border border-border overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-foreground transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {label && (
        <div className="flex justify-between items-center">
          <span className="font-mono text-[10px] tracking-widest">{label}</span>
          <span className="font-mono text-[10px]">{progress}%</span>
        </div>
      )}
    </div>
  );
}
