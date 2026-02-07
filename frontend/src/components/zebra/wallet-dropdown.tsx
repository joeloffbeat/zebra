"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

interface WalletInfo {
  chain: string;
  address: string;
}

interface WalletDropdownProps {
  suiAddress: string | null;
  embeddedWallets?: WalletInfo[];
  balance: { sui: string; usdc: string };
  onDisconnect: () => void;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export function WalletDropdown({
  suiAddress,
  embeddedWallets = [],
  balance,
  onDisconnect,
}: WalletDropdownProps) {
  const [open, setOpen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const handleCopy = useCallback((addr: string) => {
    copyToClipboard(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  }, []);

  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)}>
        {suiAddress ? truncateAddress(suiAddress) : "CONNECT"}
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-72 border border-border bg-background z-50">
            {/* Balances */}
            <div className="p-4 border-b border-border">
              <div className="text-[10px] tracking-widest text-muted-foreground mb-2">
                BALANCES
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span>{balance.sui} SUI</span>
                <span>{balance.usdc} USDC</span>
              </div>
            </div>

            {/* Sui Wallet */}
            {suiAddress && (
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[9px] tracking-widest text-muted-foreground">
                      SUI
                    </div>
                    <div className="text-xs font-mono">
                      {truncateAddress(suiAddress)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(suiAddress)}
                    className="text-[9px] tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    {copiedAddr === suiAddress ? "COPIED" : "COPY"}
                  </button>
                </div>
              </div>
            )}

            {/* Embedded Wallets */}
            {embeddedWallets.map((w) => (
              <div key={w.chain + w.address} className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[9px] tracking-widest text-muted-foreground">
                      {w.chain.toUpperCase()}
                    </div>
                    <div className="text-xs font-mono">
                      {truncateAddress(w.address)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(w.address)}
                    className="text-[9px] tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    {copiedAddr === w.address ? "COPIED" : "COPY"}
                  </button>
                </div>
              </div>
            ))}

            {/* Actions */}
            <div className="p-3 flex items-center justify-between">
              <Link href="/deposit" onClick={() => setOpen(false)}>
                <span className="text-[10px] tracking-widest hover:opacity-60 cursor-pointer">
                  BRIDGE
                </span>
              </Link>
              <button
                onClick={() => {
                  setOpen(false);
                  onDisconnect();
                }}
                className="text-[10px] tracking-widest text-muted-foreground hover:text-foreground"
              >
                DISCONNECT
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
