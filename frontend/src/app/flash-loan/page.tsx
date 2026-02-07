"use client";

import { useState } from "react";
import { Button, Input, Badge } from "@/components/ui";
import { Navbar, ZebraLoaderDots } from "@/components/zebra";
import { useBackend } from "@/hooks/use-backend";
import { useQuery } from "@tanstack/react-query";

async function fetchApi(path: string) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

interface FlashLoanHistoryEntry {
  timestamp: number;
  poolKey: string;
  amount: string;
  status: "success" | "error";
  digest?: string;
  error?: string;
}

export default function FlashLoanPage() {
  const { flashLoanDemo, teeMetrics } = useBackend();
  const [flashLoanAmount, setFlashLoanAmount] = useState("1000000000");
  const [selectedPool, setSelectedPool] = useState("SUI_DBUSDC");
  const [flashLoanResult, setFlashLoanResult] = useState<string | null>(null);
  const [history, setHistory] = useState<FlashLoanHistoryEntry[]>([]);

  const pools = useQuery<{ pools: { poolKey: string; midPrice: number | null }[] }>({
    queryKey: ["flash-loan-pools"],
    queryFn: () => fetchApi("/flash-loan/pools"),
    refetchInterval: 30000,
    retry: 1,
  });

  const flashLoansExecuted = teeMetrics.data?.metrics.flashLoansExecuted ?? 0;

  const handleFlashLoan = async () => {
    setFlashLoanResult(null);
    const amountMist = parseInt(flashLoanAmount);
    try {
      const result = await flashLoanDemo.mutateAsync({
        pool: selectedPool,
        amount: amountMist,
      });

      const entry: FlashLoanHistoryEntry = {
        timestamp: Date.now(),
        poolKey: selectedPool,
        amount: flashLoanAmount,
        status: result.success ? "success" : "error",
        digest: result.digest,
        error: result.error || result.message,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 20));

      setFlashLoanResult(
        result.success
          ? `SUCCESS — TX: ${result.digest}`
          : `RESULT: ${result.error || result.message || "UNKNOWN"}`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "FLASH LOAN FAILED";
      const entry: FlashLoanHistoryEntry = {
        timestamp: Date.now(),
        poolKey: selectedPool,
        amount: flashLoanAmount,
        status: "error",
        error: message,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 20));
      setFlashLoanResult(`ERROR: ${message}`);
    }
  };

  const suiAmount = (parseInt(flashLoanAmount) || 0) / 1e9;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-lg tracking-widest mb-2">FLASH LOANS</h1>
          <p className="text-xs tracking-wide text-muted-foreground">
            DEEPBOOK V3 FLASH LOANS — BORROW AND RETURN IN A SINGLE TRANSACTION
          </p>
        </div>

        <div className="space-y-8">
          {/* HOW IT WORKS */}
          <div className="border border-border">
            <div className="p-4 border-b border-border">
              <span className="text-xs tracking-widest text-muted-foreground">
                HOW IT WORKS
              </span>
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="text-xs tracking-widest font-mono">01 — BORROW</div>
                  <p className="text-[10px] tracking-wide text-muted-foreground">
                    BORROW BASE ASSET FROM A DEEPBOOK V3 POOL USING THE HOT POTATO
                    PATTERN. NO COLLATERAL REQUIRED.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-xs tracking-widest font-mono">02 — EXECUTE</div>
                  <p className="text-[10px] tracking-wide text-muted-foreground">
                    PERFORM ARBITRARY OPERATIONS WITH THE BORROWED ASSETS WITHIN
                    THE SAME PROGRAMMABLE TRANSACTION BLOCK.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-xs tracking-widest font-mono">03 — RETURN</div>
                  <p className="text-[10px] tracking-wide text-muted-foreground">
                    RETURN THE BORROWED AMOUNT BEFORE THE TRANSACTION COMPLETES.
                    IF NOT RETURNED, THE ENTIRE TX REVERTS.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* STATS */}
          <div className="border border-border">
            <div className="p-4 border-b border-border">
              <span className="text-xs tracking-widest text-muted-foreground">
                STATISTICS
              </span>
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatBox label="FLASH LOANS EXECUTED" value={flashLoansExecuted} />
              <StatBox
                label="AVAILABLE POOLS"
                value={pools.data?.pools.length ?? "—"}
              />
              <StatBox
                label="NETWORK"
                value={<Badge variant="hidden">TESTNET</Badge>}
              />
            </div>
          </div>

          {/* AVAILABLE POOLS */}
          <div className="border border-border">
            <div className="p-4 border-b border-border">
              <span className="text-xs tracking-widest text-muted-foreground">
                AVAILABLE POOLS
              </span>
            </div>
            <div className="p-6">
              {pools.isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <ZebraLoaderDots />
                </div>
              ) : pools.isError ? (
                <p className="text-[10px] tracking-widest text-muted-foreground text-center py-4">
                  FAILED TO LOAD POOLS — ENSURE BACKEND IS RUNNING
                </p>
              ) : (
                <div className="space-y-2">
                  {(pools.data?.pools || []).map((pool) => (
                    <button
                      key={pool.poolKey}
                      onClick={() => setSelectedPool(pool.poolKey)}
                      className={`w-full border p-4 flex items-center justify-between text-left transition-colors ${
                        selectedPool === pool.poolKey
                          ? "border-foreground"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <div>
                        <span className="text-xs tracking-widest font-mono">
                          {pool.poolKey}
                        </span>
                        {selectedPool === pool.poolKey && (
                          <span className="ml-3 text-[10px] tracking-widest text-muted-foreground">
                            SELECTED
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        MID: {pool.midPrice !== null ? pool.midPrice.toFixed(4) : "—"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* EXECUTE FLASH LOAN */}
          <div className="border border-border">
            <div className="p-4 border-b border-border">
              <span className="text-xs tracking-widest text-muted-foreground">
                EXECUTE FLASH LOAN
              </span>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] tracking-widest text-muted-foreground block mb-2">
                    POOL
                  </label>
                  <div className="border border-border p-3 text-xs font-mono tracking-widest">
                    {selectedPool}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] tracking-widest text-muted-foreground block mb-2">
                    AMOUNT (MIST)
                  </label>
                  <Input
                    type="number"
                    placeholder="AMOUNT IN MIST"
                    value={flashLoanAmount}
                    onChange={(e) => setFlashLoanAmount(e.target.value)}
                  />
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    = {suiAmount.toFixed(4)} SUI
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Button
                  onClick={handleFlashLoan}
                  disabled={flashLoanDemo.isPending || !flashLoanAmount}
                  className="flex-1"
                >
                  {flashLoanDemo.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      EXECUTING <ZebraLoaderDots />
                    </span>
                  ) : (
                    "EXECUTE FLASH LOAN"
                  )}
                </Button>
              </div>

              <p className="text-[10px] tracking-wide text-muted-foreground">
                THIS DEMO BORROWS AND IMMEDIATELY RETURNS THE ASSET IN A SINGLE PTB.
                KNOWN TESTNET LIMITATIONS MAY APPLY.
              </p>

              {flashLoanResult && (
                <div
                  className={`border p-4 text-xs font-mono tracking-wide break-all ${
                    flashLoanResult.startsWith("SUCCESS")
                      ? "border-green-500/30 text-green-400"
                      : "border-red-500/30 text-red-400"
                  }`}
                >
                  {flashLoanResult}
                </div>
              )}
            </div>
          </div>

          {/* SESSION HISTORY */}
          {history.length > 0 && (
            <div className="border border-border">
              <div className="p-4 border-b border-border">
                <span className="text-xs tracking-widest text-muted-foreground">
                  SESSION HISTORY ({history.length})
                </span>
              </div>
              <div className="p-6 space-y-2">
                {history.map((entry, i) => (
                  <div
                    key={i}
                    className="border border-border p-3 flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={entry.status === "success" ? "buy" : "sell"}
                        >
                          {entry.status.toUpperCase()}
                        </Badge>
                        <span className="text-[10px] font-mono tracking-widest">
                          {entry.poolKey}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(parseInt(entry.amount) / 1e9).toFixed(4)} SUI
                        </span>
                      </div>
                      {entry.digest && (
                        <p className="text-[10px] font-mono text-muted-foreground break-all">
                          TX: {entry.digest}
                        </p>
                      )}
                      {entry.error && (
                        <p className="text-[10px] font-mono text-red-400 break-all">
                          {entry.error}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground tracking-widest shrink-0 ml-4">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatBox({
  label,
  value,
}: {
  label: string;
  value: string | number | React.ReactNode;
}) {
  return (
    <div className="border border-border p-4 text-center">
      <p className="text-[10px] tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="font-mono text-lg mt-1">{value}</div>
    </div>
  );
}
