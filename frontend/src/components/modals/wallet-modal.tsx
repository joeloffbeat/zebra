"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { useWallet } from "@/hooks/use-wallet";

interface WalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (wallet: string) => void;
}

export function WalletModal({ open, onOpenChange, onConnect }: WalletModalProps) {
  const { availableWallets } = useWallet();

  const handleConnect = (walletName: string) => {
    onConnect(walletName);
    onOpenChange(false);
  };

  const wallets = availableWallets.length > 0
    ? availableWallets
    : [
        { name: "Sui Wallet", icon: "" },
        { name: "Suiet", icon: "" },
        { name: "Ethos Wallet", icon: "" },
      ];

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
          {wallets.map((wallet) => (
            <button
              key={wallet.name}
              onClick={() => handleConnect(wallet.name)}
              className="w-full border border-border p-4 flex items-center justify-between text-xs tracking-widest hover:opacity-60 transition-opacity"
            >
              <div className="flex items-center gap-3">
                {wallet.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={wallet.icon} alt="" className="w-5 h-5" />
                )}
                <span>{wallet.name.toUpperCase()}</span>
              </div>
              <span className="text-muted-foreground">&rarr;</span>
            </button>
          ))}

          {availableWallets.length === 0 && (
            <p className="text-[10px] tracking-wide text-muted-foreground text-center pt-2">
              NO WALLETS DETECTED. INSTALL A SUI WALLET EXTENSION.
            </p>
          )}

          <p className="text-[10px] tracking-wide text-muted-foreground text-center pt-4">
            BY CONNECTING, YOU AGREE TO OUR TERMS
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
