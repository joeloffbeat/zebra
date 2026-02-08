"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useBalance, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
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
import type { BridgeQuote, BridgeResult } from "@/lib/lifi/bridge";
import {
  LIFI_CHAIN_IDS,
  USDC_BY_CHAIN,
  NATIVE_ETH_ADDRESS,
  ETH_DECIMALS,
  USDC_DECIMALS,
  SUI_USDC_ADDRESS,
  NATIVE_SUI_ADDRESS,
} from "@/lib/constants";

const CHAINS = [
  { id: "arbitrum", name: "ARBITRUM", chainId: LIFI_CHAIN_IDS.ARBITRUM },
  { id: "base", name: "BASE", chainId: LIFI_CHAIN_IDS.BASE },
];

const TOKENS = [
  { id: "usdc", name: "USDC", decimals: USDC_DECIMALS },
  { id: "eth", name: "ETH", decimals: ETH_DECIMALS },
] as const;

const TO_TOKENS = [
  { id: "usdc", name: "USDC", address: SUI_USDC_ADDRESS, decimals: 6 },
  { id: "sui", name: "SUI", address: NATIVE_SUI_ADDRESS, decimals: 9 },
] as const;

type FromToken = (typeof TOKENS)[number]["id"];
type ToToken = (typeof TO_TOKENS)[number]["id"];
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
  const [toToken, setToToken] = useState<ToToken>("usdc");
  const [amount, setAmount] = useState("");
  const [quotes, setQuotes] = useState<BridgeQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<BridgeQuote | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bridgeResult, setBridgeResult] = useState<BridgeResult | null>(null);

  const [selectedSuiAddress, setSelectedSuiAddress] = useState<string | null>(null);

  const { address: suiAddress, isConnected: isSuiConnected } = useWallet();
  const {
    evmAddress,
    evmWallets,
    embeddedSuiAddress,
    setActiveEvmWallet,
    isPrivyAuthenticated,
    loginWithPrivy,
  } = usePrivyWallets();
  const { balance } = useWalletStore();

  // Default SUI destination to browser wallet when both become available
  const browserSuiAddress = suiAddress ?? null;
  const suiOptions = useMemo(() => {
    const opts: { address: string; label: string }[] = [];
    if (browserSuiAddress) opts.push({ address: browserSuiAddress, label: "BROWSER" });
    if (embeddedSuiAddress && embeddedSuiAddress !== browserSuiAddress)
      opts.push({ address: embeddedSuiAddress, label: "EMBEDDED" });
    return opts;
  }, [browserSuiAddress, embeddedSuiAddress]);

  useEffect(() => {
    if (selectedSuiAddress) return;
    // Default to browser wallet
    if (browserSuiAddress) {
      setSelectedSuiAddress(browserSuiAddress);
    } else if (embeddedSuiAddress) {
      setSelectedSuiAddress(embeddedSuiAddress);
    }
  }, [browserSuiAddress, embeddedSuiAddress, selectedSuiAddress]);

  const effectiveSuiAddress = selectedSuiAddress ?? browserSuiAddress ?? embeddedSuiAddress;

  const bothConnected = isPrivyAuthenticated && !!effectiveSuiAddress;
  const selectedChain = CHAINS.find((c) => c.id === fromChain) || CHAINS[0];
  const selectedToken = TOKENS.find((t) => t.id === fromToken) || TOKENS[0];
  const selectedToToken = TO_TOKENS.find((t) => t.id === toToken) || TO_TOKENS[0];

  // EVM balances on selected chain
  const { data: ethBalanceData } = useBalance({
    address: evmAddress as `0x${string}` | undefined,
    chainId: selectedChain.chainId,
  });

  const usdcAddress = USDC_BY_CHAIN[selectedChain.chainId] as `0x${string}` | undefined;
  const { data: usdcBalanceRaw } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: evmAddress ? [evmAddress as `0x${string}`] : undefined,
    chainId: selectedChain.chainId,
    query: { enabled: !!evmAddress && !!usdcAddress },
  });

  const evmEthBalance = ethBalanceData
    ? (Number(ethBalanceData.value) / 1e18).toFixed(6)
    : "0";
  const evmUsdcBalance = usdcBalanceRaw != null
    ? (Number(usdcBalanceRaw) / 1e6).toFixed(2)
    : "0";

  // Check if user has enough balance for the entered amount
  const hasInsufficientBalance = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) return false;
    const amountNum = parseFloat(amount);
    if (fromToken === "eth") {
      return amountNum > parseFloat(evmEthBalance);
    }
    return amountNum > parseFloat(evmUsdcBalance);
  }, [amount, fromToken, evmEthBalance, evmUsdcBalance]);

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
    if (!evmAddress || !effectiveSuiAddress) return;

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
        effectiveSuiAddress,
        selectedToToken.address,
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
  }, [amount, evmAddress, effectiveSuiAddress, selectedChain.chainId, fromToken, selectedToken.decimals, selectedToToken.address]);

  const handleExecuteBridge = useCallback(async () => {
    if (!selectedQuote) return;

    setStatus("executing");
    setError(null);

    try {
      const result = await executeBridge(selectedQuote.route);
      setBridgeResult(result);
      setStatus("success");
    } catch (err) {
      console.error("[LiFi] Bridge failed:", err);
      setError(err instanceof Error ? err.message : "Bridge execution failed");
      setStatus("error");
    }
  }, [selectedQuote]);

  const estimatedOutput = selectedQuote
    ? (Number(selectedQuote.estimatedOutput) / Math.pow(10, selectedToToken.decimals)).toFixed(selectedToToken.id === "sui" ? 4 : 2)
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
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] tracking-wide text-muted-foreground font-mono">
                  EVM: {truncateAddress(evmAddress)}
                </div>
                <div className="flex items-center gap-3 text-[10px] tracking-wide font-mono text-muted-foreground">
                  <span>{evmEthBalance} ETH</span>
                  <span>{evmUsdcBalance} USDC</span>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* WALLET (EVM wallet selector) */}
              {evmWallets.length > 1 && (
                <div className="space-y-2">
                  <Label>WALLET</Label>
                  <Select
                    value={evmAddress ?? undefined}
                    onValueChange={(addr) => {
                      const entry = evmWallets.find((w) => w.address === addr);
                      if (entry) {
                        setActiveEvmWallet(entry.wallet);
                        resetQuotes();
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {evmWallets.map((w) => (
                        <SelectItem key={w.address} value={w.address}>
                          {w.label} · {truncateAddress(w.address)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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
                {hasInsufficientBalance && (
                  <div className="text-[10px] tracking-wide text-red-500">
                    INSUFFICIENT {selectedToken.name} BALANCE ON {selectedChain.name}
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

            {effectiveSuiAddress && (
              <div className="text-[10px] tracking-wide text-muted-foreground mb-3 font-mono">
                SUI: {truncateAddress(effectiveSuiAddress)}
              </div>
            )}

            {/* SUI wallet selector */}
            {suiOptions.length > 1 && (
              <div className="space-y-2 mb-4">
                <Label>WALLET</Label>
                <Select
                  value={selectedSuiAddress ?? undefined}
                  onValueChange={(addr) => {
                    setSelectedSuiAddress(addr);
                    resetQuotes();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {suiOptions.map((opt) => (
                      <SelectItem key={opt.address} value={opt.address}>
                        {opt.label} · {truncateAddress(opt.address)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between py-3 border-b border-border">
              <span className="text-xs tracking-widest">CHAIN</span>
              <span className="text-xs tracking-wide">SUI MAINNET</span>
            </div>

            <div className="space-y-2 py-3">
              <Label>TOKEN</Label>
              <Select
                value={toToken}
                onValueChange={(v) => {
                  setToToken(v as ToToken);
                  resetQuotes();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TO_TOKENS.map((token) => (
                    <SelectItem key={token.id} value={token.id}>
                      {token.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    const output = (Number(q.estimatedOutput) / Math.pow(10, selectedToToken.decimals)).toFixed(selectedToToken.id === "sui" ? 4 : 2);
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
                          <span className="font-mono">~{output} {selectedToToken.name}</span>
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
                {estimatedOutput ? `~${estimatedOutput} ${selectedToToken.name}` : "\u2014"}
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
                {bridgeResult?.sourceTxHash && (
                  <span className="flex items-center gap-1.5 mt-2 font-mono opacity-60">
                    <span className="text-muted-foreground">SOURCE:</span>{" "}
                    {bridgeResult.sourceTxHash.slice(0, 10)}...{bridgeResult.sourceTxHash.slice(-6)}
                    {bridgeResult.sourceTxLink && (
                      <a
                        href={bridgeResult.sourceTxLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center hover:opacity-60 text-green-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    )}
                  </span>
                )}
                {bridgeResult?.destTxHash && (
                  <span className="flex items-center gap-1.5 mt-1 font-mono opacity-60">
                    <span className="text-muted-foreground">DEST:</span>{" "}
                    {bridgeResult.destTxHash.slice(0, 10)}...{bridgeResult.destTxHash.slice(-6)}
                    {bridgeResult.destTxLink && (
                      <a
                        href={bridgeResult.destTxLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center hover:opacity-60 text-green-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    )}
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
            ) : !effectiveSuiAddress ? (
              <Button className="w-full" size="lg" disabled>
                CONNECT SUI WALLET FIRST
              </Button>
            ) : status === "idle" || status === "error" ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleGetQuotes}
                disabled={
                  !amount || parseFloat(amount) <= 0 || !bothConnected || hasInsufficientBalance
                }
              >
                {hasInsufficientBalance ? `INSUFFICIENT ${selectedToken.name} BALANCE` : "GET QUOTES"}
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
                  setBridgeResult(null);
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
