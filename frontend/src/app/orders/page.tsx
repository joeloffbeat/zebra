"use client";

import Link from "next/link";
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

const ORDERS = [
  {
    id: "1",
    commitment: "0xAB12...4567",
    pair: "SUI/USDC",
    status: "PENDING",
    time: "2M AGO",
    zkProof: true,
  },
  {
    id: "2",
    commitment: "0xCD34...8901",
    pair: "SUI/USDC",
    status: "MATCHED",
    time: "15M AGO",
    zkProof: true,
  },
  {
    id: "3",
    commitment: "0xEF56...2345",
    pair: "ETH/USDC",
    status: "SETTLED",
    side: "BUY",
    amount: "1,000 SUI",
    price: "$1.22",
    time: "1H AGO",
    zkProof: true,
    txHash: "0x789A...BCDE",
  },
  {
    id: "4",
    commitment: "0xGH78...6789",
    pair: "SUI/USDC",
    status: "CANCELLED",
    time: "2H AGO",
    zkProof: true,
  },
];

type OrderStatus = "ALL" | "PENDING" | "MATCHED" | "SETTLED" | "CANCELLED";

export default function OrdersPage() {
  const [filter, setFilter] = useState<OrderStatus>("ALL");

  const filteredOrders = ORDERS.filter((order) => {
    if (filter === "ALL") return true;
    return order.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="hidden">PENDING</Badge>;
      case "MATCHED":
        return <Badge variant="buy">MATCHED</Badge>;
      case "SETTLED":
        return <Badge variant="secondary">SETTLED</Badge>;
      case "CANCELLED":
        return <Badge variant="outline">CANCELLED</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getAction = (order: typeof ORDERS[0]) => {
    switch (order.status) {
      case "PENDING":
        return <Button size="sm">CANCEL</Button>;
      case "MATCHED":
        return <Button size="sm">REVEAL</Button>;
      case "SETTLED":
        return (
          <a
            href={`https://suiscan.xyz/tx/${order.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs tracking-widest hover:opacity-60"
          >
            [VIEW TX]
          </a>
        );
      default:
        return null;
    }
  };

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

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-lg tracking-widest mb-2">MY ORDERS</h1>
          <p className="text-xs tracking-wide text-muted-foreground">
            TRACK YOUR HIDDEN ORDERS AND FILLS
          </p>
        </div>

        {/* FILTERS */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as OrderStatus)}>
          <TabsList className="mb-8">
            <TabsTrigger value="ALL">ALL</TabsTrigger>
            <TabsTrigger value="PENDING">PENDING</TabsTrigger>
            <TabsTrigger value="MATCHED">MATCHED</TabsTrigger>
            <TabsTrigger value="SETTLED">SETTLED</TabsTrigger>
          </TabsList>

          <TabsContent value={filter}>
            <div className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>COMMITMENT</TableHead>
                    <TableHead>PAIR</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>DETAILS</TableHead>
                    <TableHead>TIME</TableHead>
                    <TableHead>ACTION</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        NO ORDERS FOUND
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">{order.commitment}</TableCell>
                        <TableCell>{order.pair}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          {order.status === "SETTLED" ? (
                            <div className="space-y-1">
                              <div className="text-xs">
                                {order.side} {order.amount} @ {order.price}
                              </div>
                            </div>
                          ) : order.status === "PENDING" || order.status === "MATCHED" ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="w-1.5 h-1.5 bg-current animate-pulse" />
                              HIDDEN
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{order.time}</TableCell>
                        <TableCell>{getAction(order)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

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
                COUNTERPARTY FOUND. REVEAL TO COMPLETE TRADE.
              </p>
            </div>
            <div>
              <div className="text-xs tracking-widest mb-2">03 SETTLED</div>
              <p className="text-xs text-muted-foreground">
                TRADE EXECUTED ATOMICALLY VIA DEEPBOOK V3.
              </p>
            </div>
            <div>
              <div className="text-xs tracking-widest mb-2">04 CANCELLED</div>
              <p className="text-xs text-muted-foreground">
                ORDER WITHDRAWN. FUNDS RETURNED TO BALANCE.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
