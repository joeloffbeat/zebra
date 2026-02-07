"use client";

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
  const fromAsset = isBuy ? "USD" : "SUI";
  const toAsset = isBuy ? "SUI" : "USD";
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
          <div className="flex items-center justify-center gap-4">
            {/* FROM ASSET */}
            <div className="flex-1 text-center space-y-2">
              <div className="w-12 h-12 mx-auto border border-border flex items-center justify-center">
                <span className="text-lg">{fromAsset === "SUI" ? "◎" : "$"}</span>
              </div>
              <p className="font-mono text-sm">{fromAmount}</p>
              <p className="text-[10px] tracking-widest text-muted-foreground">{fromAsset}</p>
            </div>

            {/* ARROW */}
            <div className="text-muted-foreground">
              <span className="text-lg">→</span>
            </div>

            {/* TO ASSET */}
            <div className="flex-1 text-center space-y-2">
              <div className="w-12 h-12 mx-auto border border-border flex items-center justify-center">
                <span className="text-lg">{toAsset === "SUI" ? "◎" : "$"}</span>
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
            <div className="space-y-2">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-5 h-5 border border-border flex items-center justify-center text-[10px] font-mono">
                      {i + 1}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="w-px h-3 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-[10px] tracking-widest">{step.label}</p>
                    <p className="text-[9px] tracking-wide text-muted-foreground">
                      {step.desc}
                    </p>
                  </div>
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
