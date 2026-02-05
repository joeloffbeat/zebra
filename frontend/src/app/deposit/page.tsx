"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";

const CHAINS = [
  { id: "ethereum", name: "ETHEREUM", icon: "ETH" },
  { id: "arbitrum", name: "ARBITRUM", icon: "ARB" },
  { id: "base", name: "BASE", icon: "BASE" },
  { id: "polygon", name: "POLYGON", icon: "POL" },
  { id: "optimism", name: "OPTIMISM", icon: "OP" },
];

const TOKENS = [
  { symbol: "ETH", name: "ETHEREUM" },
  { symbol: "USDC", name: "USD COIN" },
  { symbol: "USDT", name: "TETHER" },
  { symbol: "DAI", name: "DAI" },
];

export default function DepositPage() {
  const [fromChain, setFromChain] = useState("ethereum");
  const [fromToken, setFromToken] = useState("ETH");
  const [amount, setAmount] = useState("");

  const estimatedReceive = amount ? (parseFloat(amount) * 1720).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-sm tracking-widest">
            ZEBRA
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/trade">
              <Button>TRADE</Button>
            </Link>
            <Button>0X1234...5678</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-lg tracking-widest mb-2">DEPOSIT</h1>
          <p className="text-xs tracking-wide text-muted-foreground">
            DEPOSIT FROM ANY CHAIN, TRADE ON SUI
          </p>
        </div>

        <div className="border border-border">
          {/* FROM SECTION */}
          <div className="p-6 border-b border-border">
            <div className="text-xs tracking-widest text-muted-foreground mb-4">
              FROM
            </div>

            <div className="space-y-4">
              {/* CHAIN */}
              <div className="space-y-2">
                <Label>CHAIN</Label>
                <Select value={fromChain} onValueChange={setFromChain}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAINS.map((chain) => (
                      <SelectItem key={chain.id} value={chain.id}>
                        {chain.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* TOKEN */}
              <div className="space-y-2">
                <Label>TOKEN</Label>
                <Select value={fromToken} onValueChange={setFromToken}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOKENS.map((token) => (
                      <SelectItem key={token.symbol} value={token.symbol}>
                        {token.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AMOUNT */}
              <div className="space-y-2">
                <Label>AMOUNT</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-xs tracking-widest text-muted-foreground">
                    {fromToken}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  BALANCE: 2.34 {fromToken}
                </div>
              </div>
            </div>
          </div>

          {/* TO SECTION */}
          <div className="p-6 border-b border-border">
            <div className="text-xs tracking-widest text-muted-foreground mb-4">
              TO
            </div>

            <div className="flex items-center justify-between py-3 border-b border-border">
              <span className="text-xs tracking-widest">CHAIN</span>
              <span className="text-xs tracking-wide">SUI</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-xs tracking-widest">TOKEN</span>
              <span className="text-xs tracking-wide">USDC</span>
            </div>
          </div>

          {/* ROUTE SECTION */}
          <div className="p-6 border-b border-border">
            <div className="text-xs tracking-widest text-muted-foreground mb-4">
              ROUTE
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border border-border flex items-center justify-center text-[8px]">1</span>
                <span className="text-muted-foreground">SWAP ON</span>
                <span>UNISWAP</span>
              </div>
              <div className="ml-2 h-4 border-l border-border" />
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border border-border flex items-center justify-center text-[8px]">2</span>
                <span className="text-muted-foreground">BRIDGE VIA</span>
                <span>WORMHOLE</span>
              </div>
              <div className="ml-2 h-4 border-l border-border" />
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border border-border flex items-center justify-center text-[8px]">3</span>
                <span className="text-muted-foreground">DEPOSIT TO</span>
                <span>ZEBRA</span>
              </div>
            </div>
          </div>

          {/* SUMMARY */}
          <div className="p-6 border-b border-border space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">YOU RECEIVE</span>
              <span className="font-mono">~${estimatedReceive} USDC</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">EST. TIME</span>
              <span>~3 MIN</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">GAS</span>
              <span className="font-mono">~$2.50</span>
            </div>
          </div>

          {/* POWERED BY */}
          <div className="p-4 border-b border-border">
            <div className="text-[10px] tracking-widest text-muted-foreground text-center">
              POWERED BY LI.FI
            </div>
          </div>

          {/* SUBMIT */}
          <div className="p-6">
            <Button className="w-full" size="lg">
              DEPOSIT
            </Button>
          </div>
        </div>

        {/* BALANCE CARD */}
        <div className="mt-8 border border-border">
          <div className="p-4 border-b border-border">
            <span className="text-xs tracking-widest text-muted-foreground">
              YOUR BALANCE
            </span>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-muted-foreground">
                TRADING BALANCE
              </span>
              <span className="font-mono text-sm">1,500.00 USDC</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-muted-foreground">
                LOCKED IN ORDERS
              </span>
              <span className="font-mono text-sm">500.00 USDC</span>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <span className="text-xs tracking-widest">
                AVAILABLE
              </span>
              <span className="font-mono text-sm">1,000.00 USDC</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

