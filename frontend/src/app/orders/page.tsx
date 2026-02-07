"use client";

import { useState } from "react";
import {
  Button,
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
import { Navbar, ZebraLoaderDots } from "@/components/zebra";
import { useDarkPool } from "@/hooks/use-dark-pool";
import { useBackend } from "@/hooks/use-backend";
import { useOrderStatus } from "@/hooks/use-order-status";
import { useWallet } from "@/hooks/use-wallet";
import type { ProgressCallback } from "@/lib/sui/progress-types";
import { MatchNotificationModal, CancelOrderModal } from "@/components/modals";

type OrderFilter = "ALL" | "PENDING" | "MATCHED" | "SETTLED" | "CANCELLED";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}

export default function OrdersPage() {
  const [filter, setFilter] = useState<OrderFilter>("ALL");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelCommitment, setCancelCommitment] = useState("");
  const { isConnected } = useWallet();
  const { orders, cancelOrder, isSubmitting } = useDarkPool();
  const { matches } = useBackend();
  const { latestMatch, showMatchModal, setShowMatchModal } = useOrderStatus();

  const filteredOrders = orders
    .filter((order) => {
      if (filter === "ALL") return true;
      return order.status.toUpperCase() === filter;
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  // Find settlement digest for an order by matching commitment prefix
  const findSettlementDigest = (commitment: string): string | undefined => {
    if (!matches.data) return undefined;
    // Normalize: strip 0x, lowercase, remove trailing "..." for comparison
    const normalize = (s: string) =>
      s.replace(/\.{3}$/, '').replace(/^0x/i, '').toLowerCase();
    const orderPrefix = normalize(commitment.slice(0, 16));
    const match = matches.data.find(
      (m) =>
        normalize(m.commitmentAPrefix) === orderPrefix ||
        normalize(m.commitmentBPrefix) === orderPrefix
    );
    return match?.settlementDigest;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="hidden">PENDING</Badge>;
      case "matched":
        return <Badge variant="buy">MATCHED</Badge>;
      case "settled":
        return <Badge variant="secondary">SETTLED</Badge>;
      case "cancelled":
        return <Badge variant="outline">CANCELLED</Badge>;
      case "expired":
        return <Badge variant="outline">EXPIRED</Badge>;
      default:
        return <Badge>{status.toUpperCase()}</Badge>;
    }
  };

  const handleCancel = (commitment: string) => {
    setCancelCommitment(commitment);
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async (onProgress: ProgressCallback) => {
    return await cancelOrder(cancelCommitment, onProgress);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-lg tracking-widest mb-2">MY ORDERS</h1>
          <p className="text-xs tracking-wide text-muted-foreground">
            TRACK YOUR HIDDEN ORDERS AND FILLS
          </p>
        </div>

        {!isConnected ? (
          <div className="border border-border p-12 text-center">
            <p className="text-xs tracking-widest text-muted-foreground">
              CONNECT YOUR WALLET TO VIEW ORDERS
            </p>
          </div>
        ) : orders.length === 0 ? (
          <div className="border border-border p-12 text-center">
            <p className="text-xs tracking-widest text-muted-foreground">
              NO ORDERS YET
            </p>
            <p className="text-[10px] tracking-wide text-muted-foreground mt-2">
              PLACE AN ORDER ON THE TRADE PAGE TO GET STARTED
            </p>
          </div>
        ) : (
          <>
            {/* FILTERS */}
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(v as OrderFilter)}
            >
              <TabsList className="mb-8">
                <TabsTrigger value="ALL">ALL ({orders.length})</TabsTrigger>
                <TabsTrigger value="PENDING">
                  PENDING (
                  {orders.filter((o) => o.status === "pending").length})
                </TabsTrigger>
                <TabsTrigger value="MATCHED">
                  MATCHED (
                  {orders.filter((o) => o.status === "matched").length})
                </TabsTrigger>
                <TabsTrigger value="SETTLED">
                  SETTLED (
                  {orders.filter((o) => o.status === "settled").length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value={filter}>
                <div className="border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>COMMITMENT</TableHead>
                        <TableHead>SIDE</TableHead>
                        <TableHead>STATUS</TableHead>
                        <TableHead>DETAILS</TableHead>
                        <TableHead>TIME</TableHead>
                        <TableHead>ACTION</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-12 text-muted-foreground"
                          >
                            NO ORDERS FOUND
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOrders.map((order) => (
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
                              {getStatusBadge(order.status)}
                            </TableCell>
                            <TableCell>
                              {order.status === "pending" ||
                              order.status === "matched" ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="w-1.5 h-1.5 bg-current animate-pulse" />
                                  HIDDEN
                                </div>
                              ) : order.status === "settled" ? (
                                <div className="text-xs font-mono">
                                  {order.txDigest
                                    ? `TX: ${order.txDigest.slice(0, 10)}...`
                                    : "\u2014"}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {"\u2014"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {timeAgo(order.createdAt)}
                            </TableCell>
                            <TableCell>
                              {order.status === "pending" ? (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleCancel(order.commitment)
                                  }
                                  disabled={isSubmitting}
                                >
                                  {isSubmitting ? (
                                    <ZebraLoaderDots />
                                  ) : (
                                    "CANCEL"
                                  )}
                                </Button>
                              ) : order.status === "settled" ? (
                                (() => {
                                  const digest =
                                    findSettlementDigest(order.commitment) ||
                                    order.txDigest;
                                  return digest ? (
                                    <a
                                      href={`https://suiscan.xyz/testnet/tx/${digest}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs tracking-widest hover:opacity-60"
                                    >
                                      [VIEW TX]
                                    </a>
                                  ) : null;
                                })()
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* ORDER EXPLANATION */}
        <div className="mt-12 border border-border">
          <div className="p-4 border-b border-border">
            <span className="text-xs tracking-widest text-muted-foreground">
              ORDER LIFECYCLE
            </span>
          </div>
          <div className="p-6 grid md:grid-cols-4 gap-6">
            <div>
              <div className="text-xs tracking-widest mb-2">01 PENDING</div>
              <p className="text-xs text-muted-foreground">
                ORDER COMMITTED ON-CHAIN. DETAILS HIDDEN VIA ZK PROOF.
              </p>
            </div>
            <div>
              <div className="text-xs tracking-widest mb-2">02 MATCHED</div>
              <p className="text-xs text-muted-foreground">
                COUNTERPARTY FOUND BY TEE MATCHING ENGINE.
              </p>
            </div>
            <div>
              <div className="text-xs tracking-widest mb-2">03 SETTLED</div>
              <p className="text-xs text-muted-foreground">
                TRADE SETTLED ON-CHAIN BY TEE. FUNDS TRANSFERRED.
              </p>
            </div>
            <div>
              <div className="text-xs tracking-widest mb-2">04 CANCELLED</div>
              <p className="text-xs text-muted-foreground">
                ORDER WITHDRAWN. FUNDS RETURNED TO WALLET.
              </p>
            </div>
          </div>
        </div>
      </main>

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
