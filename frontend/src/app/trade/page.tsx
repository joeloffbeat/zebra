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
import { HerdStats, PrivacyBadge } from "@/components/zebra";

// Mock data
const MARKETS = [
  { pair: "SUI/USDC", price: "$1.23", change: "+2.4%" },
  { pair: "ETH/USDC", price: "$1,845.00", change: "-0.8%" },
  { pair: "BTC/USDC", price: "$43,250.00", change: "+1.2%" },
];

const ACTIVE_ORDERS = [
  {
    id: "1",
    commitment: "0xAB12...4567",
    pair: "SUI/USDC",
    status: "HIDDEN",
    time: "2M AGO",
  },
  {
    id: "2",
    commitment: "0xCD34...8901",
    pair: "SUI/USDC",
    status: "MATCHED",
    time: "15M AGO",
  },
];

const RECENT_FILLS = [
  {
    id: "1",
    time: "2H AGO",
    side: "BUY",
    pair: "SUI/USDC",
    amount: "1,000 SUI",
    price: "$1.22",
  },
  {
    id: "2",
    time: "1D AGO",
    side: "SELL",
    pair: "SUI/USDC",
    amount: "500 SUI",
    price: "$1.25",
  },
];

export default function TradePage() {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [selectedMarket, setSelectedMarket] = useState("SUI/USDC");

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-sm tracking-widest">
            ZEBRA
          </Link>

          <div className="flex items-center gap-6">
            <PrivacyBadge status="hidden" />
            <Button>0X1234...5678</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* MARKETS BAR */}
        <div className="flex items-center gap-8 mb-8 pb-4 border-b border-border overflow-x-auto">
          {MARKETS.map((market) => (
            <button
              key={market.pair}
              onClick={() => setSelectedMarket(market.pair)}
              className={`flex items-center gap-4 text-xs tracking-wide whitespace-nowrap transition-opacity hover:opacity-60 ${
                selectedMarket === market.pair
                  ? "opacity-100"
                  : "opacity-40"
              }`}
            >
              <span>{market.pair}</span>
              <span className="font-mono">{market.price}</span>
              <span className="text-muted-foreground">{market.change}</span>
            </button>
          ))}
        </div>

        {/* BALANCE STRIP */}
        <div className="flex items-center justify-between mb-8 py-4 border-y border-border">
          <div className="flex items-center gap-8">
            <div>
              <span className="text-xs tracking-widest text-muted-foreground">USDC</span>
              <span className="font-mono text-sm ml-4">$50,000.00</span>
            </div>
            <div>
              <span className="text-xs tracking-widest text-muted-foreground">SUI</span>
              <span className="font-mono text-sm ml-4">25,000.00</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/deposit">
              <Button>DEPOSIT</Button>
            </Link>
            <Button>WITHDRAW</Button>
          </div>
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
              {/* PAIR */}
              <div className="space-y-2">
                <Label>PAIR</Label>
                <Select value={selectedMarket} onValueChange={setSelectedMarket}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETS.map((m) => (
                      <SelectItem key={m.pair} value={m.pair}>
                        {m.pair}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    {selectedMarket.split("/")[0]}
                  </span>
                </div>
              </div>

              {/* PRICE */}
              <div className="space-y-2">
                <Label>LIMIT PRICE</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-xs tracking-widest text-muted-foreground">
                    {selectedMarket.split("/")[1]}
                  </span>
                </div>
              </div>

              {/* EXPIRY */}
              <div className="space-y-2">
                <Label>EXPIRY</Label>
                <Select defaultValue="24h">
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
                  <span className="tracking-widest text-muted-foreground">ORDER VALUE</span>
                  <span className="font-mono">
                    ${(parseFloat(amount || "0") * parseFloat(price || "0")).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* SUBMIT */}
              <Button className="w-full" size="lg">
                HIDE IN THE HERD
              </Button>
            </div>
          </div>

          {/* HERD STATS */}
          <HerdStats
            orderCount={127}
            volume24h="$4,200,000"
            spread="~0.1%"
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
                      <TableHead>PAIR</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead>TIME</TableHead>
                      <TableHead>ACTION</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ACTIVE_ORDERS.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">{order.commitment}</TableCell>
                        <TableCell>{order.pair}</TableCell>
                        <TableCell>
                          <Badge variant={order.status === "MATCHED" ? "buy" : "hidden"}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{order.time}</TableCell>
                        <TableCell>
                          {order.status === "MATCHED" ? (
                            <Button size="sm">REVEAL</Button>
                          ) : (
                            <Button size="sm">CANCEL</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="fills">
              <div className="border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>TIME</TableHead>
                      <TableHead>SIDE</TableHead>
                      <TableHead>PAIR</TableHead>
                      <TableHead>AMOUNT</TableHead>
                      <TableHead>PRICE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {RECENT_FILLS.map((fill) => (
                      <TableRow key={fill.id}>
                        <TableCell className="text-muted-foreground">{fill.time}</TableCell>
                        <TableCell>
                          <Badge variant={fill.side === "BUY" ? "buy" : "sell"}>
                            {fill.side}
                          </Badge>
                        </TableCell>
                        <TableCell>{fill.pair}</TableCell>
                        <TableCell className="font-mono">{fill.amount}</TableCell>
                        <TableCell className="font-mono">{fill.price}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

