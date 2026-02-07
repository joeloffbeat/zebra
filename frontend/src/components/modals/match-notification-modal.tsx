"use client";

import { ExternalLink } from "lucide-react";
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
    side: string;
    amount: string;
    settlementType: string;
    settlement: string;
    status: string;
    progress: number;
    settlementDigest?: string | null;
  };
}

export function MatchNotificationModal({
  open,
  onOpenChange,
  match,
}: MatchNotificationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ORDER SETTLED</DialogTitle>
          <DialogDescription>
            YOUR HIDDEN ORDER HAS BEEN MATCHED AND SETTLED
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {/* YOUR ORDER */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="tracking-widest text-muted-foreground">SIDE</span>
              <span className="font-mono">{match.side}</span>
            </div>
            <div className="flex justify-between">
              <span className="tracking-widest text-muted-foreground">AMOUNT</span>
              <span className="font-mono">{match.amount}</span>
            </div>
          </div>

          {/* EXECUTION INFO */}
          <div className="border-t border-border pt-4 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="tracking-widest text-muted-foreground">COUNTERPARTY</span>
              <span className="font-mono">HIDDEN</span>
            </div>
            <div className="flex justify-between">
              <span className="tracking-widest text-muted-foreground">EXECUTION PRICE</span>
              <span className="font-mono">HIDDEN</span>
            </div>
            <div className="flex justify-between">
              <span className="tracking-widest text-muted-foreground">SETTLED VIA</span>
              <span className="font-mono">{match.settlementType}</span>
            </div>
            <div className="flex justify-between">
              <span className="tracking-widest text-muted-foreground">SETTLEMENT</span>
              <span className="font-mono">{match.settlement}</span>
            </div>
          </div>

          {/* PROGRESS */}
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] tracking-widest">
              <span className="text-muted-foreground">STATUS</span>
              <span>{match.status}</span>
            </div>
            <div className="h-1 bg-border">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${match.progress}%` }}
              />
            </div>
          </div>

          {/* SETTLEMENT TX */}
          {match.settlementDigest && (
            <div className="border-t border-border pt-4">
              <p className="text-[10px] tracking-widest text-muted-foreground mb-1">
                SETTLEMENT TX
              </p>
              <div className="flex items-center gap-2">
                <p className="text-[9px] font-mono text-foreground/80 break-all flex-1">
                  {match.settlementDigest}
                </p>
                <a
                  href={`https://suiscan.xyz/mainnet/tx/${match.settlementDigest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1 hover:opacity-60 transition-opacity"
                  title="View on SuiScan"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            CLOSE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
