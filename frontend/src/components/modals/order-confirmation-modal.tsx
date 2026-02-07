"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import { TransactionStepIndicator, OrderLogPanel } from "@/components/zebra";
import { cn } from "@/lib/utils";
import { useBackend } from "@/hooks/use-backend";
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
    receivers?: { address: string; percentage: number }[];
  };
  onConfirm: (onProgress: ProgressCallback) => Promise<HiddenOrder | null>;
}

type Phase = "confirm" | "processing" | "monitoring" | "complete" | "error";

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
  const [stepData, setStepData] = useState<Record<string, Record<string, string>>>({});
  const [submittedOrder, setSubmittedOrder] = useState<HiddenOrder | null>(null);
  const [settlementDigest, setSettlementDigest] = useState<string | null>(null);
  const phaseRef = useRef<Phase>("confirm");

  const { batchStatus, matches } = useBackend();

  const isBuy = order.side === "BUY";
  const fromAsset = isBuy ? "DBUSDC" : "SUI";
  const toAsset = isBuy ? "SUI" : "DBUSDC";
  const fromAmount = isBuy ? order.total.replace(" DBUSDC", "") : order.amount;
  const toAmount = isBuy ? order.amount : order.total.replace(" DBUSDC", "");

  const isExpanded = phase !== "confirm";

  const resetState = useCallback(() => {
    setPhase("confirm");
    phaseRef.current = "confirm";
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: "pending" as const })));
    setStepData({});
    setSubmittedOrder(null);
    setSettlementDigest(null);
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen && phase === "processing") return;
    if (!newOpen) resetState();
    onOpenChange(newOpen);
  }, [phase, resetState, onOpenChange]);

  const handleProgress: ProgressCallback = useCallback((stepId, status, errorMessage, data) => {
    setSteps(prev => prev.map(step =>
      step.id === stepId
        ? { ...step, status, errorMessage }
        : step
    ));

    if (data) {
      setStepData(prev => ({ ...prev, [stepId]: data }));
    }

    if (status === "error") {
      setPhase("error");
      phaseRef.current = "error";
    }
  }, []);

  const runOrder = useCallback(async () => {
    setPhase("processing");
    phaseRef.current = "processing";
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: "pending" as const })));
    setStepData({});
    setSubmittedOrder(null);
    setSettlementDigest(null);

    try {
      const result = await onConfirm(handleProgress);
      if (result) {
        setSubmittedOrder(result);
        setSteps(prev => prev.map(step => {
          if (step.id === "await-match") {
            return { ...step, status: "active" as const, desc: "WAITING FOR BATCH RESOLUTION" };
          }
          return step;
        }));
        setPhase("monitoring");
        phaseRef.current = "monitoring";
      } else if (phaseRef.current === "processing") {
        // null result without thrown error — treat as error
        setPhase("error");
        phaseRef.current = "error";
      }
    } catch {
      // Error may already be reported via handleProgress
      if (phaseRef.current === "processing") {
        setPhase("error");
        phaseRef.current = "error";
      }
    }
  }, [onConfirm, handleProgress]);

  const handleRetry = useCallback(() => {
    runOrder();
  }, [runOrder]);

  // Real-time steps 4-5 completion via match detection
  useEffect(() => {
    if (!submittedOrder || !matches.data) return;
    if (phaseRef.current !== "monitoring" && phaseRef.current !== "complete") return;

    const commitmentPrefix = submittedOrder.commitment.slice(0, 16) + "...";

    for (const match of matches.data) {
      const isMatch =
        match.commitmentAPrefix === commitmentPrefix ||
        match.commitmentBPrefix === commitmentPrefix;

      if (!isMatch) continue;

      const isDeepBook = match.commitmentBPrefix.startsWith("deepbook:");

      if (match.settled) {
        // Settlement complete
        setSteps(prev => prev.map(step => {
          if (step.id === "await-match") {
            return { ...step, status: "complete" as const, desc: "MATCH FOUND" };
          }
          if (step.id === "settlement") {
            return { ...step, status: "complete" as const, desc: "SETTLEMENT CONFIRMED" };
          }
          return step;
        }));
        if (match.settlementDigest) {
          setSettlementDigest(match.settlementDigest);
        }
        setPhase("complete");
        phaseRef.current = "complete";
      } else if (!isDeepBook) {
        // Matched but not yet settled
        setSteps(prev => prev.map(step => {
          if (step.id === "await-match") {
            return { ...step, status: "complete" as const, desc: "MATCH FOUND" };
          }
          if (step.id === "settlement") {
            return { ...step, status: "active" as const, desc: "SETTLING VIA DEEPBOOK FLASH LOAN" };
          }
          return step;
        }));
      }

      break;
    }
  }, [matches.data, submittedOrder]);

  const isProcessing = phase === "processing";

  // Batch countdown display
  const batchData = batchStatus.data;
  const timeRemainingSec = batchData ? Math.max(0, Math.ceil(batchData.timeRemainingMs / 1000)) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton={isProcessing}
        onInteractOutside={(e) => { if (isProcessing) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isProcessing) e.preventDefault(); }}
        className={cn(
          isExpanded && "max-w-3xl",
          "transition-[max-width] duration-300"
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {phase === "confirm"
              ? "CONFIRM ORDER"
              : phase === "processing"
                ? "PROCESSING ORDER"
                : phase === "monitoring"
                  ? "MONITORING ORDER"
                  : phase === "complete"
                    ? "ORDER SETTLED"
                    : "ORDER FAILED"}
          </DialogTitle>
          <DialogDescription>
            {phase === "confirm"
              ? "HIDDEN LIMIT ORDER ON ZEBRA DARK POOL"
              : phase === "processing"
                ? "PLEASE WAIT \u2014 DO NOT CLOSE THIS WINDOW"
                : phase === "monitoring"
                  ? "WAITING FOR BATCH RESOLUTION"
                  : phase === "complete"
                    ? "YOUR ORDER HAS BEEN MATCHED AND SETTLED"
                    : "AN ERROR OCCURRED DURING SUBMISSION"}
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

              {/* RECEIVERS */}
              {order.receivers && order.receivers.length > 0 && (
                <div className="border-t border-border pt-4 space-y-2">
                  <p className="text-[10px] tracking-widest text-muted-foreground text-center">
                    RECEIVER ROUTING
                  </p>
                  <div className="space-y-1 px-4">
                    {order.receivers.map((r, i) => (
                      <div key={i} className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">
                          {r.address.slice(0, 8)}...{r.address.slice(-4)}
                        </span>
                        <span>{r.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

          {/* SPLIT LAYOUT for processing/monitoring/complete/error */}
          {isExpanded && (
            <div className="flex gap-6 px-2">
              {/* LEFT PANEL: Step indicator + batch timer */}
              <div className="w-[280px] shrink-0 space-y-6">
                <TransactionStepIndicator steps={steps} />

                {/* BATCH COUNTDOWN (monitoring phase) */}
                {(phase === "monitoring" || phase === "processing") && batchData && (
                  <div className="border-t border-border pt-4 space-y-2">
                    <p className="text-[10px] tracking-widest text-muted-foreground text-center">
                      BATCH #{batchData.batchId}
                    </p>
                    {batchData.status === "resolving" ? (
                      <p className="text-xs font-mono text-center animate-pulse">
                        RESOLVING BATCH...
                      </p>
                    ) : batchData.status === "accumulating" && timeRemainingSec !== null ? (
                      <>
                        <p className="text-2xl font-mono text-center">
                          {timeRemainingSec}s
                        </p>
                        <p className="text-[9px] tracking-wide text-muted-foreground text-center">
                          ORDERS ACCUMULATE FOR 60s BEFORE TEE RESOLVES
                        </p>
                      </>
                    ) : null}
                    {batchData.orderCount > 0 && (
                      <p className="text-[9px] tracking-wide text-muted-foreground text-center">
                        {batchData.orderCount} ORDER{batchData.orderCount !== 1 ? "S" : ""} IN BATCH
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT PANEL: Execution log */}
              <div className="flex-1 border-l border-border pl-6 min-w-0">
                <OrderLogPanel
                  stepData={stepData}
                  settlementDigest={settlementDigest}
                />
              </div>
            </div>
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
          {phase === "monitoring" && (
            <Button onClick={() => handleOpenChange(false)}>
              CLOSE
            </Button>
          )}
          {phase === "complete" && (
            <div className="flex items-center gap-4">
              {settlementDigest && (
                <a
                  href={`https://suiscan.xyz/testnet/tx/${settlementDigest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] tracking-widest text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  VIEW SETTLEMENT
                </a>
              )}
              <Button onClick={() => handleOpenChange(false)}>
                CLOSE
              </Button>
            </div>
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
