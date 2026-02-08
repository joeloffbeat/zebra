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
import { usePrivyWallets } from "@/hooks/use-privy-wallets";
import { useWalletStore } from "@/lib/stores/wallet-store";
import { getAllRoutesToSui, executeBridge } from "@/lib/lifi/bridge";
import type { BridgeQuote } from "@/lib/lifi/bridge";
import {
  LIFI_CHAIN_IDS,
  USDC_BY_CHAIN,
  NATIVE_ETH_ADDRESS,
  ETH_DECIMALS,
  USDC_DECIMALS,
} from "@/lib/constants";

const CHAINS = [
  { id: "arbitrum", name: "ARBITRUM", chainId: LIFI_CHAIN_IDS.ARBITRUM },
  { id: "base", name: "BASE", chainId: LIFI_CHAIN_IDS.BASE },
];

const TOKENS = [
  { id: "usdc", name: "USDC", decimals: USDC_DECIMALS },
  { id: "eth", name: "ETH", decimals: ETH_DECIMALS },
] as const;

type FromToken = (typeof TOKENS)[number]["id"];
type BridgeStatus = "idle" | "quoting" | "quoted" | "executing" | "success" | "error";

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `~${seconds}S`;
  return `~${Math.ceil(seconds / 60)} MIN`;
}

export default function DepositPage() {
  const [fromChain, setFromChain] = useState("arbitrum");
  const [fromToken, setFromToken] = useState<FromToken>("usdc");
  const [amount, setAmount] = useState("");
  const [quotes, setQuotes] = useState<BridgeQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<BridgeQuote | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { address: suiAddress, isConnected: isSuiConnected } = useWallet();
  const { evmAddress, isPrivyAuthenticated, loginWithPrivy } = usePrivyWallets();
  const { balance } = useWalletStore();

  const bothConnected = isPrivyAuthenticated && isSuiConnected;
  const selectedChain = CHAINS.find((c) => c.id === fromChain) || CHAINS[0];
  const selectedToken = TOKENS.find((t) => t.id === fromToken) || TOKENS[0];

  const handleNumericInput = (value: string) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
      setQuotes([]);
      setSelectedQuote(null);
      setStatus("idle");
    }
  };

  const resetQuotes = () => {
    setQuotes([]);
    setSelectedQuote(null);
    setStatus("idle");
  };

  const handleGetQuotes = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    if (!evmAddress || !suiAddress) return;

    setStatus("quoting");
    setError(null);
    setQuotes([]);
    setSelectedQuote(null);

    try {
      const tokenAddress =
        fromToken === "eth"
          ? NATIVE_ETH_ADDRESS
          : USDC_BY_CHAIN[selectedChain.chainId];

      if (!tokenAddress) {
        throw new Error(`Unsupported source chain: ${selectedChain.chainId}`);
      }

      const amountRaw = (
        parseFloat(amount) * Math.pow(10, selectedToken.decimals)
      ).toFixed(0);

      const results = await getAllRoutesToSui(
        selectedChain.chainId,
        tokenAddress,
        amountRaw,
        evmAddress,
        suiAddress,
      );

      setQuotes(results);

      if (results.length === 1) {
        setSelectedQuote(results[0]);
      } else if (results.length > 1) {
        // Auto-select the first (recommended) route
        setSelectedQuote(results[0]);
      }

      setStatus("quoted");
    } catch (err) {
      console.error("[LiFi] Quote failed:", err);
      setError(err instanceof Error ? err.message : "Failed to get quotes");
      setStatus("error");
    }
  }, [amount, evmAddress, suiAddress, selectedChain.chainId, fromToken, selectedToken.decimals]);

  const handleExecuteBridge = useCallback(async () => {
    if (!selectedQuote) return;

    setStatus("executing");
    setError(null);

    try {
      const result = await executeBridge(selectedQuote.route);
      if (result.txHash) setTxHash(result.txHash);
      setStatus("success");
    } catch (err) {
      console.error("[LiFi] Bridge failed:", err);
      setError(err instanceof Error ? err.message : "Bridge execution failed");
      setStatus("error");
    }
  }, [selectedQuote]);

  const estimatedOutput = selectedQuote
    ? (Number(selectedQuote.estimatedOutput) / 1e6).toFixed(2)
    : null;

  const estimatedTime = selectedQuote
    ? formatTime(selectedQuote.estimatedTime)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-6 py-12 max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-lg tracking-widest mb-2">DEPOSIT</h1>
          <p className="text-xs tracking-wide text-muted-foreground">
            BRIDGE TO SUI VIA LI.FI
          </p>
        </div>

        <div className="border border-border">
          {/* FROM SECTION */}
          <div className="p-6 border-b border-border">
            <div className="text-xs tracking-widest text-muted-foreground mb-4">
              FROM
            </div>

            {isPrivyAuthenticated && evmAddress && (
              <div className="text-[10px] tracking-wide text-muted-foreground mb-3 font-mono">
                EVM: {truncateAddress(evmAddress)}
              </div>
            )}

            <div className="space-y-4">
              {/* CHAIN */}
              <div className="space-y-2">
                <Label>CHAIN</Label>
                <Select
                  value={fromChain}
                  onValueChange={(v) => {
                    setFromChain(v);
                    resetQuotes();
                  }}
                >
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
                <Select
                  value={fromToken}
                  onValueChange={(v) => {
                    setFromToken(v as FromToken);
                    resetQuotes();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOKENS.map((token) => (
                      <SelectItem key={token.id} value={token.id}>
                        {token.name}
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
                    {selectedToken.name}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* TO SECTION */}
          <div className="p-6 border-b border-border">
            <div className="text-xs tracking-widest text-muted-foreground mb-4">
              TO
            </div>

            {isSuiConnected && suiAddress && (
              <div className="text-[10px] tracking-wide text-muted-foreground mb-3 font-mono">
                SUI: {truncateAddress(suiAddress)}
              </div>
            )}

            <div className="flex items-center justify-between py-3 border-b border-border">
              <span className="text-xs tracking-widest">CHAIN</span>
              <span className="text-xs tracking-wide">SUI MAINNET</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-xs tracking-widest">TOKEN</span>
              <span className="text-xs tracking-wide">USDC</span>
            </div>
          </div>

          {/* AVAILABLE ROUTES */}
          {status === "quoted" && (
            <div className="p-6 border-b border-border">
              <div className="text-xs tracking-widest text-muted-foreground mb-4">
                AVAILABLE ROUTES
              </div>

              {quotes.length === 0 ? (
                <div className="text-xs tracking-wide text-muted-foreground text-center py-6">
                  NO ROUTES AVAILABLE FOR THIS AMOUNT
                </div>
              ) : (
                <div className="space-y-3">
                  {quotes.map((q, i) => {
                    const isSelected = selectedQuote?.route.id === q.route.id;
                    const output = (Number(q.estimatedOutput) / 1e6).toFixed(2);
                    const time = formatTime(q.estimatedTime);

                    return (
                      <button
                        key={q.route.id}
                        type="button"
                        onClick={() => setSelectedQuote(q)}
                        className={`w-full text-left border p-4 transition-colors ${
                          isSelected
                            ? "border-foreground"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`w-3 h-3 rounded-full border ${
                              isSelected
                                ? "border-foreground bg-foreground"
                                : "border-muted-foreground"
                            }`}
                          />
                          {q.bridgeLogo && (
                            <img
                              src={q.bridgeLogo}
                              alt=""
                              className="w-4 h-4 rounded-full"
                            />
                          )}
                          <span className="text-xs tracking-widest font-medium">
                            {q.bridgeName.toUpperCase()}
                          </span>
                          {q.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] tracking-wider px-1.5 py-0.5 border border-border text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground ml-5">
                          <span className="font-mono">~{output} USDC</span>
                          <span>{time}</span>
                          <span className="font-mono">GAS ~${q.gasCostUSD}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ROUTE STEPS (for selected quote) */}
          {selectedQuote && status === "quoted" && (
            <div className="p-6 border-b border-border">
              <div className="text-xs tracking-widest text-muted-foreground mb-4">
                ROUTE
              </div>

              <div className="space-y-3 text-xs">
                {selectedQuote.steps.map((step, i) => (
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
                    {i < selectedQuote.steps.length - 1 && (
                      <div className="ml-2 h-4 border-l border-border" />
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-border flex items-center justify-center text-[8px]">
                    {selectedQuote.steps.length + 1}
                  </span>
                  <span className="text-muted-foreground">RECEIVE ON</span>
                  <span>SUI</span>
                </div>
              </div>
            </div>
          )}

          {/* SUMMARY */}
          <div className="p-6 border-b border-border space-y-3">
            <div className="text-xs tracking-widest text-muted-foreground mb-2">
              SUMMARY
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">
                YOU RECEIVE
              </span>
              <span className="font-mono">
                {estimatedOutput ? `~${estimatedOutput} USDC` : "\u2014"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">
                EST. TIME
              </span>
              <span>{estimatedTime ?? "\u2014"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">GAS</span>
              <span className="font-mono">
                {selectedQuote ? `~$${selectedQuote.gasCostUSD}` : "\u2014"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">FEES</span>
              <span className="font-mono">
                {selectedQuote ? `~$${selectedQuote.totalFeesUSD}` : "\u2014"}
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
            {!isPrivyAuthenticated ? (
              <Button
                className="w-full"
                size="lg"
                onClick={() => loginWithPrivy()}
              >
                LOGIN WITH PRIVY
              </Button>
            ) : !isSuiConnected ? (
              <Button className="w-full" size="lg" disabled>
                CONNECT SUI WALLET FIRST
              </Button>
            ) : status === "idle" || status === "error" ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleGetQuotes}
                disabled={
                  !amount || parseFloat(amount) <= 0 || !bothConnected
                }
              >
                GET QUOTES
              </Button>
            ) : status === "quoting" ? (
              <Button className="w-full" size="lg" disabled>
                FETCHING QUOTES...
              </Button>
            ) : status === "quoted" && selectedQuote ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleExecuteBridge}
              >
                BRIDGE {amount} {selectedToken.name} TO SUI
              </Button>
            ) : status === "quoted" && !selectedQuote ? (
              <Button className="w-full" size="lg" disabled>
                SELECT A ROUTE
              </Button>
            ) : status === "executing" ? (
              <Button className="w-full" size="lg" disabled>
                BRIDGING...
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={() => {
                  setStatus("idle");
                  setQuotes([]);
                  setSelectedQuote(null);
                  setAmount("");
                }}
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
                {isSuiConnected ? `${balance.sui} SUI` : "\u2014"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-muted-foreground">
                USDC
              </span>
              <span className="font-mono text-sm">
                {isSuiConnected ? `${balance.usdc} USDC` : "\u2014"}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
