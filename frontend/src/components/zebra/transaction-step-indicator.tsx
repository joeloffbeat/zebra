"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepState } from "@/lib/sui/progress-types";

interface TransactionStepIndicatorProps {
  steps: StepState[];
}

export function TransactionStepIndicator({ steps }: TransactionStepIndicatorProps) {
  return (
    <div className="flex flex-col items-center space-y-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex flex-col items-center text-center">
          {/* Step circle */}
          <div
            className={cn(
              "w-6 h-6 border flex items-center justify-center text-[10px] font-mono transition-all duration-300",
              step.status === "complete" && "border-foreground bg-foreground text-background",
              step.status === "active" && "border-foreground animate-step-pulse",
              step.status === "error" && "border-red-500 bg-red-500/10 text-red-500",
              step.status === "pending" && "border-border text-muted-foreground"
            )}
          >
            {step.status === "complete" ? (
              <Check className="w-3 h-3 stroke-[3]" />
            ) : step.status === "error" ? (
              <X className="w-3 h-3" />
            ) : (
              i + 1
            )}
          </div>

          {/* Label */}
          <p
            className={cn(
              "text-[10px] tracking-widest mt-1 transition-all duration-300",
              step.status === "complete" && "text-foreground font-bold",
              step.status === "active" && "text-foreground",
              step.status === "error" && "text-red-500",
              step.status === "pending" && "text-muted-foreground"
            )}
          >
            {step.label}
          </p>

          {/* Description or error message */}
          <p
            className={cn(
              "text-[9px] tracking-wide max-w-[220px] transition-all duration-300",
              step.status === "error" ? "text-red-400" : "text-muted-foreground"
            )}
          >
            {step.status === "error" && step.errorMessage
              ? step.errorMessage
              : step.status === "active"
                ? "PROCESSING..."
                : step.desc}
          </p>

          {/* Connecting line */}
          {i < steps.length - 1 && (
            <div
              className={cn(
                "w-px h-4 my-1 transition-all duration-300",
                step.status === "complete" ? "bg-foreground/50" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
