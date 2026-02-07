"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
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
import type { StepState, ProgressCallback, OrderStepId } from "@/lib/sui/progress-types";
import type { HiddenOrder } from "@/lib/sui/types";

interface OrderConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    side: "BUY" | "SELL";
    amount: string;
    token: string;
    price: string;
    total: string;
    expiry: string;
  };
  onConfirm: (onProgress: ProgressCallback) => Promise<HiddenOrder | null>;
}

type Phase = "confirm" | "processing" | "complete" | "error";

const INITIAL_STEPS: StepState[] = [
  { id: "zk-proof", label: "GENERATE ZK PROOF", desc: "PROVE ORDER VALIDITY WITHOUT REVEALING DETAILS", status: "pending" },
  { id: "seal-encrypt", label: "ENCRYPT WITH SEAL", desc: "ORDER DATA ENCRYPTED FOR TEE ONLY", status: "pending" },
  { id: "submit-tx", label: "SUBMIT ON-CHAIN", desc: "COMMITMENT HASH STORED ON SUI", status: "pending" },
  { id: "await-match", label: "AWAIT MATCH", desc: "TEE FINDS MATCHING COUNTERPARTY", status: "pending" },
  { id: "settlement", label: "ATOMIC SETTLEMENT", desc: "FUNDS TRANSFERRED FROM DARK POOL VAULT", status: "pending" },
];

export function OrderConfirmationModal({
  open,
  onOpenChange,
  order,
  onConfirm,
}: OrderConfirmationModalProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS);

  const isBuy = order.side === "BUY";
  const fromAsset = isBuy ? "USDC" : "SUI";
  const toAsset = isBuy ? "SUI" : "USDC";
  const fromAmount = isBuy ? order.total.replace(" USD", "") : order.amount;
  const toAmount = isBuy ? order.amount : order.total.replace(" USD", "");

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

  const runOrder = useCallback(async () => {
    setPhase("processing");
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: "pending" as const })));

    try {
      const result = await onConfirm(handleProgress);
      if (result) {
        // Mark monitoring steps
        setSteps(prev => prev.map(step => {
          if (step.id === "await-match" || step.id === "settlement") {
            return { ...step, status: "active" as const, desc: "MONITORING" };
          }
          return step;
        }));
        setPhase("complete");
      } else {
        // null result without thrown error — treat as error
        if (phase !== "error") {
          setPhase("error");
        }
      }
    } catch {
      // Error already reported via onProgress, phase set to "error" in handleProgress
      if (phase !== "error") {
        setPhase("error");
      }
    }
  }, [onConfirm, handleProgress, phase]);

  const handleRetry = useCallback(() => {
    runOrder();
  }, [runOrder]);

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
            {phase === "confirm" ? "CONFIRM ORDER" : phase === "complete" ? "ORDER SUBMITTED" : phase === "error" ? "ORDER FAILED" : "PROCESSING ORDER"}
          </DialogTitle>
          <DialogDescription>
            {phase === "confirm"
              ? "HIDDEN LIMIT ORDER ON ZEBRA DARK POOL"
              : phase === "complete"
                ? "YOUR ORDER IS NOW BEING MONITORED"
                : phase === "error"
                  ? "AN ERROR OCCURRED DURING SUBMISSION"
                  : "PLEASE WAIT — DO NOT CLOSE THIS WINDOW"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-6">
          {phase === "confirm" && (
            <>
              {/* SWAP VISUALIZATION */}
              <div className="flex items-center justify-center gap-6">
                <div className="text-center space-y-1">
                  <div className="w-8 h-8 mx-auto flex items-center justify-center">
                    <Image
                      src={fromAsset === "SUI" ? "/assets/sui.svg" : "/assets/usdc.svg"}
                      alt={fromAsset}
                      width={28}
                      height={28}
                      className="w-7 h-7"
                    />
                  </div>
                  <p className="font-mono text-xs">{fromAmount}</p>
                  <p className="text-[10px] tracking-widest text-muted-foreground">{fromAsset}</p>
                </div>
                <div className="text-muted-foreground">
                  <span className="text-lg">&rarr;</span>
                </div>
                <div className="text-center space-y-1">
                  <div className="w-8 h-8 mx-auto flex items-center justify-center">
                    <Image
                      src={toAsset === "SUI" ? "/assets/sui.svg" : "/assets/usdc.svg"}
                      alt={toAsset}
                      width={28}
                      height={28}
                      className="w-7 h-7"
                    />
                  </div>
                  <p className="font-mono text-xs">{toAmount}</p>
                  <p className="text-[10px] tracking-widest text-muted-foreground">{toAsset}</p>
                </div>
              </div>

              {/* PRICE & EXPIRY */}
              <div className="flex justify-center gap-8 text-xs">
                <div className="text-center">
                  <p className="text-muted-foreground tracking-widest">PRICE</p>
                  <p className="font-mono">{order.price}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground tracking-widest">EXPIRES</p>
                  <p className="font-mono">{order.expiry}</p>
                </div>
              </div>

              {/* STEP PREVIEW */}
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-[10px] tracking-widest text-muted-foreground text-center">
                  WHAT HAPPENS NEXT
                </p>
                <div className="flex flex-col items-center space-y-0">
                  {INITIAL_STEPS.map((step, i) => (
                    <div key={i} className="flex flex-col items-center text-center">
                      <div className="w-6 h-6 border border-border flex items-center justify-center text-[10px] font-mono">
                        {i + 1}
                      </div>
                      <p className="text-[10px] tracking-widest mt-1">{step.label}</p>
                      <p className="text-[9px] tracking-wide text-muted-foreground max-w-[200px]">
                        {step.desc}
                      </p>
                      {i < INITIAL_STEPS.length - 1 && (
                        <div className="w-px h-4 bg-border my-1" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {(phase === "processing" || phase === "complete" || phase === "error") && (
            <TransactionStepIndicator steps={steps} />
          )}
        </div>

        <DialogFooter>
          {phase === "confirm" && (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                CANCEL
              </Button>
              <Button onClick={runOrder}>
                HIDE IN THE HERD
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
