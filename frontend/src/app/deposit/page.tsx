"use client";

import { useState, useCallback } from "react";
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
import { Navbar } from "@/components/zebra";
import { useWallet } from "@/hooks/use-wallet";
import { useWalletStore } from "@/lib/stores/wallet-store";
import { getQuoteArbToSui, executeBridge } from "@/lib/lifi/bridge";
import type { BridgeQuote } from "@/lib/lifi/bridge";
import { LIFI_CHAIN_IDS } from "@/lib/constants";

const CHAINS = [
  { id: "arbitrum", name: "ARBITRUM", chainId: LIFI_CHAIN_IDS.ARBITRUM },
  { id: "ethereum", name: "ETHEREUM", chainId: LIFI_CHAIN_IDS.ETHEREUM },
  { id: "base", name: "BASE", chainId: LIFI_CHAIN_IDS.BASE },
  { id: "optimism", name: "OPTIMISM", chainId: LIFI_CHAIN_IDS.OPTIMISM },
  { id: "polygon", name: "POLYGON", chainId: LIFI_CHAIN_IDS.POLYGON },
];

const TOKENS = [
  { symbol: "USDC", name: "USD COIN", decimals: 6 },
  { symbol: "ETH", name: "ETHEREUM", decimals: 18 },
  { symbol: "USDT", name: "TETHER", decimals: 6 },
];

type BridgeStatus = "idle" | "quoting" | "quoted" | "executing" | "success" | "error";

export default function DepositPage() {
  const [fromChain, setFromChain] = useState("arbitrum");
  const [fromToken, setFromToken] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { address, isConnected } = useWallet();
  const { balance } = useWalletStore();

  const handleNumericInput = (value: string) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
      setQuote(null);
      setStatus("idle");
    }
  };

  const handleGetQuote = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    if (!address) return;

    setStatus("quoting");
    setError(null);

    try {
      const token = TOKENS.find(t => t.symbol === fromToken);
      const decimals = token?.decimals || 6;
      const amountRaw = (parseFloat(amount) * Math.pow(10, decimals)).toString();

      const result = await getQuoteArbToSui(amountRaw, address, address);
      setQuote(result);
      setStatus("quoted");
    } catch (err) {
      console.error('[LiFi] Quote failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to get quote');
      setStatus("error");
    }
  }, [amount, address, fromToken]);

  const handleExecuteBridge = useCallback(async () => {
    if (!quote) return;

    setStatus("executing");
    setError(null);

    try {
      const result = await executeBridge(quote.route);
      const hash = result.steps?.[0]?.execution?.process?.[0]?.txHash;
      if (hash) setTxHash(hash);
      setStatus("success");
    } catch (err) {
      console.error('[LiFi] Bridge failed:', err);
      setError(err instanceof Error ? err.message : 'Bridge execution failed');
      setStatus("error");
    }
  }, [quote]);

  const estimatedOutput = quote
    ? (Number(quote.estimatedOutput) / 1e6).toFixed(2)
    : null;

  const estimatedTime = quote
    ? `~${Math.ceil(quote.estimatedTime / 60)} MIN`
    : "~3 MIN";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-6 py-12 max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-lg tracking-widest mb-2">DEPOSIT</h1>
          <p className="text-xs tracking-wide text-muted-foreground">
            BRIDGE FROM ANY CHAIN, TRADE ON SUI
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
                <Select value={fromChain} onValueChange={(v) => { setFromChain(v); setQuote(null); setStatus("idle"); }}>
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
                <Select value={fromToken} onValueChange={(v) => { setFromToken(v); setQuote(null); setStatus("idle"); }}>
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
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => handleNumericInput(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-xs tracking-widest text-muted-foreground">
                    {fromToken}
                  </span>
                </div>
                {isConnected && (
                  <div className="text-[10px] text-muted-foreground tracking-wide">
                    SUI BALANCE: {balance.sui} SUI &middot; {balance.usdc} USDC
                  </div>
                )}
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
              <span className="text-xs tracking-wide">SUI MAINNET</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-xs tracking-widest">TOKEN</span>
              <span className="text-xs tracking-wide">USDC</span>
            </div>
          </div>

          {/* ROUTE SECTION */}
          {quote && (
            <div className="p-6 border-b border-border">
              <div className="text-xs tracking-widest text-muted-foreground mb-4">
                ROUTE
              </div>

              <div className="space-y-3 text-xs">
                {quote.steps.map((step, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 border border-border flex items-center justify-center text-[8px]">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">
                        {step.type.toUpperCase()} VIA
                      </span>
                      <span>{step.tool.toUpperCase()}</span>
                    </div>
                    {i < quote.steps.length - 1 && (
                      <div className="ml-2 h-4 border-l border-border" />
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-border flex items-center justify-center text-[8px]">
                    {quote.steps.length + 1}
                  </span>
                  <span className="text-muted-foreground">RECEIVE ON</span>
                  <span>SUI</span>
                </div>
              </div>
            </div>
          )}

          {/* SUMMARY */}
          <div className="p-6 border-b border-border space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">YOU RECEIVE</span>
              <span className="font-mono">
                {estimatedOutput ? `~${estimatedOutput} USDC` : "\u2014"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">EST. TIME</span>
              <span>{quote ? estimatedTime : "\u2014"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">GAS</span>
              <span className="font-mono">
                {quote ? `~$${quote.gasCostUSD}` : "\u2014"}
              </span>
            </div>
          </div>

          {/* POWERED BY */}
          <div className="p-4 border-b border-border">
            <div className="text-[10px] tracking-widest text-muted-foreground text-center">
              POWERED BY LI.FI
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div className="px-6 py-3 border-b border-border">
              <div className="text-[10px] tracking-wide text-red-500 border border-red-500/20 p-3">
                {error}
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {status === "success" && (
            <div className="px-6 py-3 border-b border-border">
              <div className="text-[10px] tracking-wide text-green-500 border border-green-500/20 p-3">
                BRIDGE SUBMITTED SUCCESSFULLY
                {txHash && (
                  <span className="block mt-1 font-mono opacity-60">
                    TX: {txHash.slice(0, 10)}...{txHash.slice(-6)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* SUBMIT */}
          <div className="p-6">
            {!isConnected ? (
              <Button className="w-full" size="lg" disabled>
                CONNECT WALLET
              </Button>
            ) : status === "idle" || status === "error" ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleGetQuote}
                disabled={!amount || parseFloat(amount) <= 0}
              >
                GET QUOTE
              </Button>
            ) : status === "quoting" ? (
              <Button className="w-full" size="lg" disabled>
                FETCHING QUOTE...
              </Button>
            ) : status === "quoted" ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleExecuteBridge}
              >
                BRIDGE {amount} {fromToken} TO SUI
              </Button>
            ) : status === "executing" ? (
              <Button className="w-full" size="lg" disabled>
                BRIDGING...
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={() => { setStatus("idle"); setQuote(null); setAmount(""); }}
              >
                BRIDGE AGAIN
              </Button>
            )}
          </div>
        </div>

        {/* BALANCE CARD */}
        <div className="mt-8 border border-border">
          <div className="p-4 border-b border-border">
            <span className="text-xs tracking-widest text-muted-foreground">
              YOUR SUI BALANCE
            </span>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-muted-foreground">
                SUI
              </span>
              <span className="font-mono text-sm">
                {isConnected ? `${balance.sui} SUI` : "\u2014"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-muted-foreground">
                USDC
              </span>
              <span className="font-mono text-sm">
                {isConnected ? `${balance.usdc} USDC` : "\u2014"}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
