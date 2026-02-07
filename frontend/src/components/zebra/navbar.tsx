"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { WalletModal } from "@/components/modals";
import { WalletDropdown } from "@/components/zebra/wallet-dropdown";
import { useWallet } from "@/hooks/use-wallet";
import { useWalletStore } from "@/lib/stores/wallet-store";

const NAV_LINKS = [
  { href: "/trade", label: "TRADE" },
  { href: "/deposit", label: "DEPOSIT" },
  { href: "/orders", label: "ORDERS" },
  { href: "/tee", label: "TEE" },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected, connect, disconnect } = useWallet();
  const { balance } = useWalletStore();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const handleWalletClick = () => {
    if (!isConnected) {
      setWalletModalOpen(true);
    }
  };

  const handleConnect = (walletName: string) => {
    connect(walletName);
  };

  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="text-sm tracking-widest">
            ZEBRA
          </Link>

          <nav className="flex-1 flex items-center justify-center gap-4">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button
                  className={pathname === link.href ? "opacity-100" : "opacity-40"}
                >
                  {link.label}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {isConnected && address ? (
              <WalletDropdown
                suiAddress={address}
                balance={balance}
                onDisconnect={disconnect}
              />
            ) : (
              <Button onClick={handleWalletClick}>
                CONNECT
              </Button>
            )}
          </div>
        </div>
      </header>

      <WalletModal
        open={walletModalOpen}
        onOpenChange={setWalletModalOpen}
        onConnect={handleConnect}
      />
    </>
  );
}
