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

export function OrderConfirmationModal({
  open,
  onOpenChange,
  order,
  onConfirm,
}: OrderConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>CONFIRM ORDER</DialogTitle>
          <DialogDescription>
            YOU ARE PLACING A HIDDEN LIMIT ORDER
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {/* ORDER SUMMARY */}
          <div className="border border-border p-4 space-y-3">
            <p className="text-sm tracking-widest">
              {order.side} {order.amount} {order.token} @ {order.price}
            </p>
            <div className="flex justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">TOTAL</span>
              <span className="font-mono">{order.total}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">EXPIRES</span>
              <span className="font-mono">{order.expiry}</span>
            </div>
          </div>

          {/* PRIVACY GUARANTEE */}
          <div className="space-y-2">
            <p className="text-xs tracking-widest text-muted-foreground">
              PRIVACY GUARANTEE
            </p>
            <div className="border border-border p-4 space-y-2">
              {[
                "YOUR ORDER DETAILS ARE HIDDEN",
                "ONLY A COMMITMENT HASH IS STORED",
                "PRICE AND SIZE REVEALED ONLY WHEN MATCHED",
                "OTHER TRADERS CANNOT SEE YOUR ORDER",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] tracking-wide">
                  <span className="text-muted-foreground">[+]</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* INFO */}
          <div className="space-y-1 text-[10px] tracking-wide text-muted-foreground">
            <p>FUNDS: {order.total} WILL BE LOCKED IN YOUR STATE CHANNEL</p>
            <p>GAS: FREE (STATE CHANNEL UPDATE)</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            CANCEL
          </Button>
          <Button onClick={onConfirm}>HIDE IN THE HERD</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
