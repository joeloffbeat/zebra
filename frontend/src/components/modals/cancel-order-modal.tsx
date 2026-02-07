"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from "@/components/ui";
import { TransactionStepIndicator } from "@/components/zebra";
import type { StepState, ProgressCallback } from "@/lib/sui/progress-types";

interface CancelOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitment: string;
  onConfirmCancel: (onProgress: ProgressCallback) => Promise<boolean>;
}

type Phase = "confirm" | "processing" | "complete" | "error";

const INITIAL_STEPS: StepState[] = [
  { id: "build-tx", label: "BUILD TRANSACTION", desc: "CONSTRUCTING CANCEL TRANSACTION", status: "pending" },
  { id: "sign-execute", label: "SIGN & EXECUTE", desc: "APPROVE IN YOUR WALLET", status: "pending" },
];

export function CancelOrderModal({
  open,
  onOpenChange,
  commitment,
  onConfirmCancel,
}: CancelOrderModalProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS);

  const truncatedCommitment = commitment
    ? `${commitment.slice(0, 10)}...${commitment.slice(-4)}`
    : "";

  const resetState = useCallback(() => {
    setPhase("confirm");
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: "pending" as const })));
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen && phase === "processing") return;
    if (!newOpen) resetState();
    onOpenChange(newOpen);
  }, [phase, resetState, onOpenChange]);

  const handleProgress: ProgressCallback = useCallback((stepId, status, errorMessage) => {
    setSteps(prev => prev.map(step =>
      step.id === stepId
        ? { ...step, status, errorMessage }
        : step
    ));

    if (status === "error") {
      setPhase("error");
    }
  }, []);

  const runCancel = useCallback(async () => {
    setPhase("processing");
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: "pending" as const })));

    try {
      const success = await onConfirmCancel(handleProgress);
      if (success) {
        setPhase("complete");
      } else {
        if (phase !== "error") {
          setPhase("error");
        }
      }
    } catch {
      if (phase !== "error") {
        setPhase("error");
      }
    }
  }, [onConfirmCancel, handleProgress, phase]);

  const handleRetry = useCallback(() => {
    runCancel();
  }, [runCancel]);

  const isProcessing = phase === "processing";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton={isProcessing}
        onInteractOutside={(e) => { if (isProcessing) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isProcessing) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>
            {phase === "confirm" ? "CANCEL ORDER" : phase === "complete" ? "ORDER CANCELLED" : phase === "error" ? "CANCELLATION FAILED" : "CANCELLING ORDER"}
          </DialogTitle>
          <DialogDescription>
            {phase === "confirm"
              ? "THIS ACTION CANNOT BE UNDONE"
              : phase === "complete"
                ? "ORDER CANCELLED — FUNDS RETURNED"
                : phase === "error"
                  ? "AN ERROR OCCURRED DURING CANCELLATION"
                  : "PLEASE WAIT — DO NOT CLOSE THIS WINDOW"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-6">
          {phase === "confirm" && (
            <>
              <div className="text-center space-y-3">
                <p className="text-[10px] tracking-widest text-muted-foreground">
                  ORDER COMMITMENT
                </p>
                <p className="font-mono text-xs">{truncatedCommitment}</p>
              </div>
              <div className="border border-yellow-500/20 p-4">
                <p className="text-[10px] tracking-wide text-yellow-500 text-center">
                  CANCELLING WILL REMOVE YOUR ORDER FROM THE DARK POOL AND RETURN LOCKED FUNDS TO YOUR WALLET.
                </p>
              </div>
            </>
          )}

          {(phase === "processing" || phase === "complete" || phase === "error") && (
            <TransactionStepIndicator steps={steps} />
          )}

          {phase === "complete" && (
            <div className="border border-green-500/20 p-4">
              <p className="text-[10px] tracking-wide text-green-500 text-center">
                ORDER CANCELLED — FUNDS RETURNED TO YOUR WALLET
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {phase === "confirm" && (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                KEEP ORDER
              </Button>
              <Button onClick={runCancel}>
                CANCEL ORDER
              </Button>
            </>
          )}
          {phase === "complete" && (
            <Button onClick={() => handleOpenChange(false)}>
              CLOSE
            </Button>
          )}
          {phase === "error" && (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                CLOSE
              </Button>
              <Button onClick={handleRetry}>
                RETRY
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
