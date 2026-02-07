"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { Navbar } from "@/components/zebra";
import { HerdStats, PrivacyBadge } from "@/components/zebra";
import { OrderConfirmationModal, CancelOrderModal, MatchNotificationModal } from "@/components/modals";
import { ZebraLoaderDots } from "@/components/zebra";
import { useWallet } from "@/hooks/use-wallet";
import { useDarkPool } from "@/hooks/use-dark-pool";
import { useBackend } from "@/hooks/use-backend";
import { useOrderStatus } from "@/hooks/use-order-status";
import { useWalletStore } from "@/lib/stores/wallet-store";
import type { ProgressCallback } from "@/lib/sui/progress-types";

const EXPIRY_TO_SECONDS: Record<string, number> = {
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
  "7d": 604800,
};

const EXPIRY_LABELS: Record<string, string> = {
  "1h": "1 HOUR",
  "6h": "6 HOURS",
  "24h": "24 HOURS",
  "7d": "7 DAYS",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}

export default function TradePage() {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [expiry, setExpiry] = useState("24h");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelCommitment, setCancelCommitment] = useState("");
  const [receivers, setReceivers] = useState<{ address: string; percentage: string }[]>([]);
  const [showReceivers, setShowReceivers] = useState(false);

  const { isConnected, address } = useWallet();
  const { balance } = useWalletStore();
  const { submitOrder, cancelOrder, isSubmitting, orders } = useDarkPool();
  const { matches, teeMetrics, midPrice: midPriceQuery, batchStatus } = useBackend();
  const { latestMatch, showMatchModal, setShowMatchModal } = useOrderStatus();

  const midPriceValue = midPriceQuery.data?.midPrice;
  const isMidPriceLoading = midPriceQuery.isLoading || midPriceQuery.isFetching;

  const batch = batchStatus.data;
  const batchCountdown = batch?.timeRemainingMs
    ? Math.ceil(batch.timeRemainingMs / 1000)
    : 0;

  // Auto-fill price when mid-price loads and order type is MARKET
  useEffect(() => {
    if (orderType === "MARKET" && midPriceValue) {
      setPrice(midPriceValue.toString());
    }
  }, [orderType, midPriceValue]);

  // Handle order type change
  const handleOrderTypeChange = (type: "LIMIT" | "MARKET") => {
    setOrderType(type);
    if (type === "MARKET" && midPriceValue) {
      setPrice(midPriceValue.toString());
    } else if (type === "LIMIT") {
      // Clear price when switching back to limit
      setPrice("");
    }
  };

  // Helper to validate and set numeric input (decimals only)
  const handleNumericInput = (
    value: string,
    setter: (val: string) => void
  ) => {
    // Allow empty, or valid decimal numbers
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setter(value);
    }
  };

  const activeOrders = orders.filter(
    (o) => o.status === "pending" || o.status === "matched"
  );

  const settledMatches = matches.data?.filter((m) => m.settled) || [];

  const handleSubmit = useCallback(() => {
    setSubmitError(null);
    if (!isConnected) {
      setSubmitError("CONNECT YOUR WALLET FIRST");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setSubmitError("ENTER A VALID AMOUNT");
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      setSubmitError("ENTER A VALID PRICE");
      return;
    }
    // Validate receivers if specified
    if (receivers.length > 0) {
      const sum = receivers.reduce((s, r) => s + (parseInt(r.percentage) || 0), 0);
      if (sum !== 100) {
        setSubmitError("RECEIVER PERCENTAGES MUST SUM TO 100");
        return;
      }
      const hasInvalid = receivers.some(r => !r.address || !r.address.startsWith("0x") || r.address.length !== 66);
      if (hasInvalid) {
        setSubmitError("INVALID RECEIVER ADDRESS FORMAT");
        return;
      }
    }

    setShowConfirmModal(true);
  }, [isConnected, amount, price, receivers]);

  const handleConfirmOrder = useCallback(async (onProgress: ProgressCallback) => {
    setSubmitError(null);

    // Convert to MIST (1 SUI = 1e9 MIST)
    const amountMist = BigInt(Math.floor(parseFloat(amount) * 1e9));
    const priceMist = BigInt(Math.floor(parseFloat(price) * 1e9));
    const expiryTime = BigInt(
      Math.floor(Date.now() / 1000) + EXPIRY_TO_SECONDS[expiry]
    );

    // Parse receivers if specified
    const parsedReceivers = receivers.length > 0
      ? receivers.map(r => ({ address: r.address, percentage: parseInt(r.percentage) || 0 }))
      : undefined;

    const order = await submitOrder({
      side: side.toLowerCase() as "buy" | "sell",
      amount: amountMist,
      price: priceMist,
      expiry: expiryTime,
      receivers: parsedReceivers,
    }, onProgress, address ?? undefined);

    if (order) {
      setSubmitSuccess(true);
      setAmount("");
      setPrice("");
      setTimeout(() => setSubmitSuccess(false), 3000);
    }

    return order;
  }, [amount, price, side, expiry, submitOrder, receivers, address]);

  const handleCancel = useCallback(
    (commitment: string) => {
      setCancelCommitment(commitment);
      setShowCancelModal(true);
    },
    []
  );

  const handleConfirmCancel = useCallback(
    async (onProgress: ProgressCallback) => {
      return await cancelOrder(cancelCommitment, onProgress);
    },
    [cancelOrder, cancelCommitment]
  );

  const orderValue = (
    parseFloat(amount || "0") * parseFloat(price || "0")
  ).toFixed(4);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-6 py-8">
        {/* MARKET INFO BAR */}
        <div className="flex items-center gap-8 mb-8 pb-4 border-b border-border">
          <div className="flex items-center gap-4 text-xs tracking-wide">
            <span className="opacity-100">SUI/DBUSDC</span>
            <span className="font-mono text-muted-foreground">
              {midPriceValue ? `${midPriceValue}` : "\u2014"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              DEEPBOOK REF PRICE
            </span>
          </div>
          <div className="ml-auto">
            <PrivacyBadge status="hidden" />
          </div>
        </div>

        {/* BATCH STATUS BAR */}
        {batch && batch.status !== "idle" && (
          <div className="flex items-center gap-4 mb-4 px-4 py-3 border border-border text-xs tracking-wide">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                batch.status === "accumulating"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-blue-500 animate-pulse"
              }`}
            />
            <span className="text-muted-foreground">
              BATCH #{batch.batchId}
            </span>
            <span className="font-mono">
              {batch.orderCount} ORDER{batch.orderCount !== 1 ? "S" : ""}
            </span>
            {batch.status === "accumulating" && batchCountdown > 0 && (
              <span className="font-mono text-muted-foreground">
                {batchCountdown}S
              </span>
            )}
            <span className="ml-auto text-muted-foreground uppercase">
              {batch.status === "accumulating"
                ? "ACCUMULATING"
                : "RESOLVING"}
            </span>
          </div>
        )}

        {/* BALANCE STRIP */}
        <div className="flex items-center justify-between mb-8 py-4 border-y border-border">
          <div className="flex items-center gap-8">
            <div>
              <span className="text-xs tracking-widest text-muted-foreground">
                AVAILABLE
              </span>
              <span className="font-mono text-sm ml-4">
                {isConnected ? `${balance.sui} SUI` : "\u2014"}
              </span>
            </div>
            <div>
              <span className="font-mono text-sm">
                {isConnected ? `${balance.dbusdc} DBUSDC` : ""}
              </span>
            </div>
          </div>
          {isConnected && (
            <span className="text-[10px] tracking-wide text-muted-foreground">
              TESTNET
            </span>
          )}
        </div>

        {/* TRADING GRID */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* ORDER FORM */}
          <div className="border border-border">
            <div className="p-4 border-b border-border">
              <span className="text-xs tracking-widest text-muted-foreground">
                PLACE ORDER
              </span>
            </div>

            <div className="p-6 space-y-6">
              {/* PAIR (locked) */}
              <div className="space-y-2">
                <Label>PAIR</Label>
                <div className="text-xs tracking-widest border border-border p-3 text-muted-foreground">
                  SUI / DBUSDC (TESTNET)
                </div>
              </div>

              {/* SIDE */}
              <div className="space-y-2">
                <Label>SIDE</Label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setSide("BUY")}
                    className={`text-xs tracking-widest transition-opacity ${
                      side === "BUY" ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    [BUY]
                  </button>
                  <button
                    onClick={() => setSide("SELL")}
                    className={`text-xs tracking-widest transition-opacity ${
                      side === "SELL" ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    [SELL]
                  </button>
                </div>
              </div>

              {/* ORDER TYPE */}
              <div className="space-y-2">
                <Label>ORDER TYPE</Label>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleOrderTypeChange("LIMIT")}
                    className={`text-xs tracking-widest transition-opacity ${
                      orderType === "LIMIT" ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    [LIMIT]
                  </button>
                  <button
                    onClick={() => handleOrderTypeChange("MARKET")}
                    className={`text-xs tracking-widest transition-opacity ${
                      orderType === "MARKET" ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    [MARKET]
                  </button>
                </div>
              </div>

              {/* AMOUNT */}
              <div className="space-y-2">
                <Label>AMOUNT (SUI)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => handleNumericInput(e.target.value, setAmount)}
                    className="flex-1"
                  />
                  <span className="text-xs tracking-widest text-muted-foreground">
                    SUI
                  </span>
                </div>
              </div>

              {/* PRICE */}
              <div className="space-y-2">
                <Label>
                  {orderType === "MARKET" ? "MARKET PRICE (DBUSDC)" : "LIMIT PRICE (DBUSDC)"}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={orderType === "MARKET" && isMidPriceLoading ? "" : price}
                    onChange={(e) => handleNumericInput(e.target.value, setPrice)}
                    className="flex-1"
                    disabled={orderType === "MARKET"}
                  />
                  <span className="text-xs tracking-widest text-muted-foreground">
                    DBUSDC
                  </span>
                </div>
                {orderType === "MARKET" && (
                  <p className="text-[10px] tracking-wide text-muted-foreground">
                    {isMidPriceLoading
                      ? "FETCHING DEEPBOOK MID-PRICE..."
                      : midPriceValue !== null && midPriceValue !== undefined
                        ? `USING DEEPBOOK MID-PRICE ($${midPriceValue})`
                        : "MID-PRICE UNAVAILABLE"}
                  </p>
                )}
              </div>

              {/* EXPIRY */}
              <div className="space-y-2">
                <Label>EXPIRY</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 HOUR</SelectItem>
                    <SelectItem value="6h">6 HOURS</SelectItem>
                    <SelectItem value="24h">24 HOURS</SelectItem>
                    <SelectItem value="7d">7 DAYS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* RECEIVER ROUTING */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowReceivers(!showReceivers)}
                  className="text-[10px] tracking-widest text-muted-foreground hover:opacity-60"
                >
                  {showReceivers ? "[-] RECEIVER ROUTING" : "[+] RECEIVER ROUTING"}
                </button>
                {showReceivers && (
                  <div className="space-y-3 border border-border p-4">
                    <p className="text-[9px] tracking-wide text-muted-foreground">
                      SPLIT PAYOUT TO MULTIPLE ADDRESSES. LEAVE EMPTY FOR DEFAULT (YOUR WALLET).
                    </p>
                    {receivers.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder="0x..."
                          value={r.address}
                          onChange={(e) => {
                            const updated = [...receivers];
                            updated[idx] = { ...updated[idx], address: e.target.value };
                            setReceivers(updated);
                          }}
                          className="flex-1 text-xs font-mono"
                        />
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="%"
                          value={r.percentage}
                          onChange={(e) => {
                            const updated = [...receivers];
                            updated[idx] = { ...updated[idx], percentage: e.target.value };
                            setReceivers(updated);
                          }}
                          className="w-16 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setReceivers(receivers.filter((_, i) => i !== idx))}
                          className="text-xs text-muted-foreground hover:text-red-500"
                        >
                          [X]
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setReceivers([...receivers, { address: "", percentage: "" }])}
                      className="text-[10px] tracking-widest text-muted-foreground hover:opacity-60"
                    >
                      [+ ADD RECEIVER]
                    </button>
                    {receivers.length > 0 && (() => {
                      const sum = receivers.reduce((s, r) => s + (parseInt(r.percentage) || 0), 0);
                      return sum !== 100 ? (
                        <p className="text-[9px] text-red-500">
                          PERCENTAGES MUST SUM TO 100 (CURRENT: {sum})
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

              {/* ORDER VALUE */}
              <div className="py-4 border-t border-border">
                <div className="flex justify-between text-xs">
                  <span className="tracking-widest text-muted-foreground">
                    ORDER VALUE
                  </span>
                  <span className="font-mono">{orderValue} DBUSDC</span>
                </div>
              </div>

              {/* ERROR / SUCCESS */}
              {submitError && (
                <div className="text-[10px] tracking-wide text-red-500 border border-red-500/20 p-3">
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="text-[10px] tracking-wide text-green-500 border border-green-500/20 p-3">
                  {batch
                    ? `ADDED TO BATCH #${batch.batchId}. ZK PROOF VERIFIED ON-CHAIN.`
                    : "ORDER SUBMITTED SUCCESSFULLY. ZK PROOF VERIFIED ON-CHAIN."}
                </div>
              )}

              {/* SUBMIT */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    SUBMITTING <ZebraLoaderDots />
                  </span>
                ) : !isConnected ? (
                  "CONNECT WALLET"
                ) : (
                  "HIDE IN THE HERD"
                )}
              </Button>
            </div>
          </div>

          {/* HERD STATS */}
          <HerdStats
            orderCount={teeMetrics.data?.metrics.ordersReceived || 0}
            volume24h={
              teeMetrics.data
                ? `${(teeMetrics.data.metrics.totalVolumeSettled / 1e9).toFixed(2)} SUI`
                : "\u2014"
            }
            spread={midPriceValue ? "~0.1%" : "N/A"}
          />
        </div>

        {/* ORDERS SECTION */}
        <div className="mt-12">
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">ACTIVE ORDERS</TabsTrigger>
              <TabsTrigger value="fills">RECENT FILLS</TabsTrigger>
              <TabsTrigger value="batch">BATCH INFO</TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              <div className="border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>COMMITMENT</TableHead>
                      <TableHead>SIDE</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead>TIME</TableHead>
                      <TableHead>ACTION</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeOrders.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-8 text-muted-foreground text-xs tracking-widest"
                        >
                          NO ACTIVE ORDERS
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-xs">
                            {order.commitment.slice(0, 10)}...
                            {order.commitment.slice(-4)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.side === "buy" ? "buy" : "sell"
                              }
                            >
                              {order.side.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.status === "matched"
                                  ? "buy"
                                  : "hidden"
                              }
                            >
                              {order.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {timeAgo(order.createdAt)}
                          </TableCell>
                          <TableCell>
                            {order.status === "pending" && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleCancel(order.commitment)
                                }
                                disabled={isSubmitting}
                              >
                                CANCEL
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="fills">
              <div className="border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ORDER A</TableHead>
                      <TableHead>ORDER B</TableHead>
                      <TableHead>SETTLED</TableHead>
                      <TableHead>TIME</TableHead>
                      <TableHead>TX</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settledMatches.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-8 text-muted-foreground text-xs tracking-widest"
                        >
                          NO RECENT FILLS
                        </TableCell>
                      </TableRow>
                    ) : (
                      settledMatches.map((match, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">
                            {match.commitmentAPrefix}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {match.commitmentBPrefix}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {match.commitmentBPrefix.startsWith("deepbook:")
                                ? "DEEPBOOK"
                                : "SETTLED"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {timeAgo(match.timestamp)}
                          </TableCell>
                          <TableCell>
                            {match.settlementDigest && (
                              <a
                                href={`https://suiscan.xyz/testnet/tx/${match.settlementDigest}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs tracking-widest hover:opacity-60"
                              >
                                [VIEW]
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="batch">
              <div className="border border-border p-6 space-y-4">
                {batch?.lastResolution ? (
                  <>
                    <div className="text-xs tracking-widest text-muted-foreground mb-4">
                      LAST RESOLUTION — BATCH #{batch.lastResolution.batchId}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-[10px] tracking-wide text-muted-foreground">
                          TOTAL ORDERS
                        </div>
                        <div className="font-mono text-sm">
                          {batch.lastResolution.totalOrders}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] tracking-wide text-muted-foreground">
                          INTERNAL MATCHES
                        </div>
                        <div className="font-mono text-sm">
                          {batch.lastResolution.internalMatches}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] tracking-wide text-muted-foreground">
                          DEEPBOOK SETTLEMENTS
                        </div>
                        <div className="font-mono text-sm">
                          {batch.lastResolution.deepBookSettlements}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] tracking-wide text-muted-foreground">
                          CARRY-OVER BUYS
                        </div>
                        <div className="font-mono text-sm">
                          {batch.lastResolution.carryOverBuys}
                        </div>
                      </div>
                    </div>
                    {batch.lastResolution.deepBookFailures > 0 && (
                      <div className="text-[10px] tracking-wide text-yellow-500 border border-yellow-500/20 p-3 mt-4">
                        {batch.lastResolution.deepBookFailures} DEEPBOOK
                        SETTLEMENT(S) FAILED — ORDERS CARRIED TO NEXT BATCH
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-2">
                      RESOLVED{" "}
                      {timeAgo(batch.lastResolution.timestamp)}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-xs tracking-widest">
                    NO BATCH RESOLUTIONS YET
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* ORDER CONFIRMATION MODAL */}
      <OrderConfirmationModal
        open={showConfirmModal}
        onOpenChange={setShowConfirmModal}
        order={{
          side: side,
          amount: amount,
          token: "SUI",
          price: `${price} DBUSDC`,
          total: `${orderValue} DBUSDC`,
          expiry: EXPIRY_LABELS[expiry],
          receivers: receivers.length > 0 ? receivers.map(r => ({
            address: r.address,
            percentage: parseInt(r.percentage) || 0,
          })) : undefined,
        }}
        onConfirm={handleConfirmOrder}
      />

      {/* CANCEL ORDER MODAL */}
      <CancelOrderModal
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        commitment={cancelCommitment}
        onConfirmCancel={handleConfirmCancel}
      />

      {/* MATCH NOTIFICATION MODAL */}
      {latestMatch && (
        <MatchNotificationModal
          open={showMatchModal}
          onOpenChange={setShowMatchModal}
          match={{
            yourOrder: { side: "\u2014", amount: "\u2014", price: "\u2014" },
            matchedWith: { side: "\u2014", amount: "\u2014", price: "\u2014" },
            executionPrice: "HIDDEN",
            via: "TEE MATCHER",
            settlement: latestMatch.settled ? "COMPLETE" : "PENDING",
            progress: latestMatch.settled ? 100 : 50,
            status: latestMatch.settled ? "SETTLED" : "MATCHING",
          }}
          onViewTransaction={() => {
            if (latestMatch.settlementDigest) {
              window.open(
                `https://suiscan.xyz/testnet/tx/${latestMatch.settlementDigest}`,
                "_blank"
              );
            }
            setShowMatchModal(false);
          }}
        />
      )}
    </div>
  );
}
