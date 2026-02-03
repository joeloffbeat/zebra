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

interface MatchNotificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: {
    yourOrder: {
      side: string;
      amount: string;
      price: string;
    };
    matchedWith: {
      side: string;
      amount: string;
      price: string;
    };
    executionPrice: string;
    via: string;
    settlement: string;
    progress: number;
    status: string;
  };
  onViewTransaction: () => void;
}

export function MatchNotificationModal({
  open,
  onOpenChange,
  match,
  onViewTransaction,
}: MatchNotificationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ORDER MATCHED</DialogTitle>
          <DialogDescription>
            YOUR HIDDEN ORDER HAS BEEN MATCHED
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {/* ORDER COMPARISON */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
            {/* YOUR ORDER */}
            <div className="border border-border p-3 text-center">
              <p className="text-[10px] tracking-widest text-muted-foreground">
                YOUR ORDER
              </p>
              <p className="text-xs tracking-widest mt-2">
                {match.yourOrder.side} {match.yourOrder.amount}
              </p>
              <p className="font-mono text-[10px] mt-1">@ {match.yourOrder.price}</p>
            </div>

            {/* ARROW */}
            <div className="text-xs text-muted-foreground">&harr;</div>

            {/* MATCHED WITH */}
            <div className="border border-border p-3 text-center">
              <p className="text-[10px] tracking-widest text-muted-foreground">
                MATCHED WITH
              </p>
              <p className="text-xs tracking-widest mt-2">
                {match.matchedWith.side} {match.matchedWith.amount}
              </p>
              <p className="font-mono text-[10px] mt-1">
                @ {match.matchedWith.price}
              </p>
            </div>
          </div>

          {/* EXECUTION PRICE */}
          <div className="border border-border p-4 text-center bg-foreground text-background">
            <p className="text-[10px] tracking-widest">
              EXECUTION PRICE
            </p>
            <p className="font-mono text-lg mt-1">{match.executionPrice}</p>
            <p className="text-[10px] tracking-wide opacity-70 mt-1">
              (MIDPOINT)
            </p>
          </div>

          {/* EXECUTION INFO */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="tracking-widest text-muted-foreground">EXECUTION VIA</span>
              <span className="font-mono">{match.via}</span>
            </div>
            <div className="flex justify-between">
              <span className="tracking-widest text-muted-foreground">SETTLEMENT</span>
              <span className="font-mono">{match.settlement}</span>
            </div>
          </div>

          {/* PROGRESS */}
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] tracking-widest">
              <span className="text-muted-foreground">PROGRESS</span>
              <span>{match.status}</span>
            </div>
            <div className="h-1 bg-border">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${match.progress}%` }}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={onViewTransaction}>
            VIEW TRANSACTION
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
