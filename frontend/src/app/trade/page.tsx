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
import { OrderConfirmationModal, MatchNotificationModal } from "@/components/modals";
import { ZebraLoaderDots } from "@/components/zebra";
import { useWallet } from "@/hooks/use-wallet";
import { useDarkPool } from "@/hooks/use-dark-pool";
import { useBackend } from "@/hooks/use-backend";
import { useOrderStatus } from "@/hooks/use-order-status";
import { useWalletStore } from "@/lib/stores/wallet-store";
import { useSuiClient } from "@mysten/dapp-kit";

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
  const [expiry, setExpiry] = useState("24h");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProving, setIsProving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const { address, isConnected } = useWallet();
  const { balance } = useWalletStore();
  const { submitOrder, cancelOrder, isSubmitting, orders } = useDarkPool();
  const { matches, teeMetrics, midPrice: midPriceQuery } = useBackend();
  const { latestMatch, showMatchModal, setShowMatchModal } = useOrderStatus();
  const suiClient = useSuiClient();

  const midPriceValue = midPriceQuery.data?.midPrice;

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
    setShowConfirmModal(true);
  }, [isConnected, amount, price]);

  const handleConfirmOrder = useCallback(async () => {
    setShowConfirmModal(false);
    setSubmitError(null);
    setIsProving(true);

    try {
      // Convert to MIST (1 SUI = 1e9 MIST)
      const amountMist = BigInt(Math.floor(parseFloat(amount) * 1e9));
      const priceMist = BigInt(Math.floor(parseFloat(price) * 1e9));
      const expiryTime = BigInt(
        Math.floor(Date.now() / 1000) + EXPIRY_TO_SECONDS[expiry]
      );

      // Select a coin object
      const coins = await suiClient.getCoins({
        owner: address!,
        coinType: "0x2::sui::SUI",
      });

      // Find a coin with enough balance (need amount for locking + some for gas)
      const neededAmount = amountMist;
      const selectedCoin = coins.data.find(
        (c) => BigInt(c.balance) >= neededAmount
      );

      if (!selectedCoin) {
        throw new Error(
          `INSUFFICIENT BALANCE. NEED ${amount} SUI BUT NO COIN OBJECT HAS ENOUGH.`
        );
      }

      const order = await submitOrder({
        side: side.toLowerCase() as "buy" | "sell",
        amount: amountMist,
        price: priceMist,
        expiry: expiryTime,
        coinObjectId: selectedCoin.coinObjectId,
      });

      if (order) {
        setSubmitSuccess(true);
        setAmount("");
        setPrice("");
        setTimeout(() => setSubmitSuccess(false), 3000);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "ORDER SUBMISSION FAILED";
      setSubmitError(message);
    } finally {
      setIsProving(false);
    }
  }, [amount, price, side, expiry, address, suiClient, submitOrder]);

  const handleCancel = useCallback(
    async (commitment: string, orderSide: string) => {
      await cancelOrder(commitment, orderSide === "buy");
    },
    [cancelOrder]
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
            <span className="opacity-100">SUI/SUI</span>
            <span className="font-mono text-muted-foreground">
              {midPriceValue ? `${midPriceValue}` : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              DEEPBOOK REF PRICE
            </span>
          </div>
          <div className="ml-auto">
            <PrivacyBadge status="hidden" />
          </div>
        </div>

        {/* BALANCE STRIP */}
        <div className="flex items-center justify-between mb-8 py-4 border-y border-border">
          <div className="flex items-center gap-8">
            <div>
              <span className="text-xs tracking-widest text-muted-foreground">
                AVAILABLE
              </span>
              <span className="font-mono text-sm ml-4">
                {isConnected ? `${balance.sui} SUI` : "—"}
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
                  SUI / SUI (TESTNET)
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

              {/* AMOUNT */}
              <div className="space-y-2">
                <Label>AMOUNT (SUI)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1"
                    min="0"
                    step="0.01"
                  />
                  <span className="text-xs tracking-widest text-muted-foreground">
                    SUI
                  </span>
                </div>
              </div>

              {/* PRICE */}
              <div className="space-y-2">
                <Label>LIMIT PRICE (SUI)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="flex-1"
                    min="0"
                    step="0.01"
                  />
                  <span className="text-xs tracking-widest text-muted-foreground">
                    SUI
                  </span>
                </div>
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

              {/* ORDER VALUE */}
              <div className="py-4 border-t border-border">
                <div className="flex justify-between text-xs">
                  <span className="tracking-widest text-muted-foreground">
                    ORDER VALUE
                  </span>
                  <span className="font-mono">{orderValue} SUI</span>
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
                  ORDER SUBMITTED SUCCESSFULLY. ZK PROOF VERIFIED ON-CHAIN.
                </div>
              )}

              {/* SUBMIT */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={isSubmitting || isProving}
              >
                {isProving ? (
                  <span className="flex items-center gap-2">
                    GENERATING ZK PROOF <ZebraLoaderDots />
                  </span>
                ) : isSubmitting ? (
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
                : "—"
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
                                  handleCancel(order.commitment, order.side)
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
                      <TableHead>BUYER</TableHead>
                      <TableHead>SELLER</TableHead>
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
                            {match.buyerCommitmentPrefix}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {match.sellerCommitmentPrefix}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">SETTLED</Badge>
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
          price: `${price} SUI`,
          total: `${orderValue} SUI`,
          expiry: EXPIRY_LABELS[expiry],
        }}
        onConfirm={handleConfirmOrder}
      />

      {/* MATCH NOTIFICATION MODAL */}
      {latestMatch && (
        <MatchNotificationModal
          open={showMatchModal}
          onOpenChange={setShowMatchModal}
          match={{
            yourOrder: { side: "—", amount: "—", price: "—" },
            matchedWith: { side: "—", amount: "—", price: "—" },
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
