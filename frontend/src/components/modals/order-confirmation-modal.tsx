"use client";

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
  onConfirm: () => void;
}

const STEPS = [
  { label: "GENERATE ZK PROOF", desc: "PROVE ORDER VALIDITY WITHOUT REVEALING DETAILS" },
  { label: "ENCRYPT WITH SEAL", desc: "ORDER DATA ENCRYPTED FOR TEE ONLY" },
  { label: "SUBMIT ON-CHAIN", desc: "COMMITMENT HASH STORED ON SUI" },
  { label: "AWAIT MATCH", desc: "TEE FINDS MATCHING COUNTERPARTY" },
  { label: "ATOMIC SETTLEMENT", desc: "TRADE EXECUTES VIA DEEPBOOK V3" },
];

export function OrderConfirmationModal({
  open,
  onOpenChange,
  order,
  onConfirm,
}: OrderConfirmationModalProps) {
  const isBuy = order.side === "BUY";

  // For BUY: giving USD, receiving SUI
  // For SELL: giving SUI, receiving USD
  const fromAsset = isBuy ? "USDC" : "SUI";
  const toAsset = isBuy ? "SUI" : "USDC";
  const fromAmount = isBuy ? order.total.replace(" USD", "") : order.amount;
  const toAmount = isBuy ? order.amount : order.total.replace(" USD", "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>CONFIRM ORDER</DialogTitle>
          <DialogDescription>
            HIDDEN LIMIT ORDER ON ZEBRA DARK POOL
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-6">
          {/* SWAP VISUALIZATION */}
          <div className="flex items-center justify-center gap-6">
            {/* FROM ASSET */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto flex items-center justify-center">
                <Image
                  src={fromAsset === "SUI" ? "/assets/sui.svg" : "/assets/usdc.svg"}
                  alt={fromAsset}
                  width={48}
                  height={48}
                  className="w-12 h-12"
                />
              </div>
              <p className="font-mono text-sm">{fromAmount}</p>
              <p className="text-[10px] tracking-widest text-muted-foreground">{fromAsset}</p>
            </div>

            {/* ARROW */}
            <div className="text-muted-foreground">
              <span className="text-2xl">→</span>
            </div>

            {/* TO ASSET */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto flex items-center justify-center">
                <Image
                  src={toAsset === "SUI" ? "/assets/sui.svg" : "/assets/usdc.svg"}
                  alt={toAsset}
                  width={48}
                  height={48}
                  className="w-12 h-12"
                />
              </div>
              <p className="font-mono text-sm">{toAmount}</p>
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

          {/* STEP BY STEP PROCESS */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-[10px] tracking-widest text-muted-foreground text-center">
              WHAT HAPPENS NEXT
            </p>
            <div className="flex flex-col items-center space-y-0">
              {STEPS.map((step, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  <div className="w-6 h-6 border border-border flex items-center justify-center text-[10px] font-mono">
                    {i + 1}
                  </div>
                  <p className="text-[10px] tracking-widest mt-1">{step.label}</p>
                  <p className="text-[9px] tracking-wide text-muted-foreground max-w-[200px]">
                    {step.desc}
                  </p>
                  {i < STEPS.length - 1 && (
                    <div className="w-px h-4 bg-border my-1" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            CANCEL
          </Button>
          <Button onClick={onConfirm}>
            HIDE IN THE HERD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
