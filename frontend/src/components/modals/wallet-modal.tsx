"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";

interface WalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (wallet: string) => void;
}

const WALLETS = [
  { id: "sui", name: "SUI WALLET" },
  { id: "suiet", name: "SUIET" },
  { id: "ethos", name: "ETHOS" },
  { id: "martian", name: "MARTIAN" },
];

export function WalletModal({ open, onOpenChange, onConnect }: WalletModalProps) {
  const handleConnect = (walletId: string) => {
    onConnect(walletId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>CONNECT WALLET</DialogTitle>
          <DialogDescription>
            SELECT A WALLET TO ENTER THE HERD
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-2">
          {WALLETS.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => handleConnect(wallet.id)}
              className="w-full border border-border p-4 flex items-center justify-between text-xs tracking-widest hover:opacity-60 transition-opacity"
            >
              <span>{wallet.name}</span>
              <span className="text-muted-foreground">&rarr;</span>
            </button>
          ))}

          <p className="text-[10px] tracking-wide text-muted-foreground text-center pt-4">
            BY CONNECTING, YOU AGREE TO OUR TERMS
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
