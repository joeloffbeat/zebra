"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import type { PrivyWalletEntry } from "@/hooks/use-privy-wallets";

interface WalletDropdownProps {
  browserSuiAddress: string | null;
  privyWallets: PrivyWalletEntry[];
  balance: { sui: string; usdc: string };
  onDisconnectSui: () => void;
  onLogoutPrivy: () => void;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export function WalletDropdown({
  browserSuiAddress,
  privyWallets,
  balance,
  onDisconnectSui,
  onLogoutPrivy,
}: WalletDropdownProps) {
  const [open, setOpen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const handleCopy = useCallback((addr: string) => {
    copyToClipboard(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  }, []);

  const displayAddress = browserSuiAddress || privyWallets[0]?.address;

  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)}>
        {displayAddress ? truncateAddress(displayAddress) : "CONNECT"}
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

            {/* Embedded Wallets */}
            {privyWallets.length > 0 && (
              <div className="border-b border-border">
                <div className="px-3 pt-3 pb-1">
                  <div className="text-[9px] tracking-widest text-muted-foreground">
                    EMBEDDED WALLETS
                  </div>
                </div>
                {privyWallets.map((wallet) => (
                  <div key={`${wallet.chain}-${wallet.address}`} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[9px] tracking-widest text-muted-foreground">
                          {wallet.chain}
                        </div>
                        <div className="text-xs font-mono">
                          {truncateAddress(wallet.address)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopy(wallet.address)}
                        className="text-[9px] tracking-widest text-muted-foreground hover:text-foreground"
                      >
                        {copiedAddr === wallet.address ? "COPIED" : "COPY"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Browser Wallet */}
            {browserSuiAddress && (
              <div className="border-b border-border">
                <div className="px-3 pt-3 pb-1">
                  <div className="text-[9px] tracking-widest text-muted-foreground">
                    BROWSER WALLET
                  </div>
                </div>
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[9px] tracking-widest text-muted-foreground">
                        SUI
                      </div>
                      <div className="text-xs font-mono">
                        {truncateAddress(browserSuiAddress)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopy(browserSuiAddress)}
                      className="text-[9px] tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      {copiedAddr === browserSuiAddress ? "COPIED" : "COPY"}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                  onDisconnectSui();
                  onLogoutPrivy();
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
