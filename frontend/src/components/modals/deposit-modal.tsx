"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: string;
  maxBalance: string;
  onDeposit: (token: string, amount: string) => void;
}

export function DepositModal({
  open,
  onOpenChange,
  currentBalance,
  maxBalance,
  onDeposit,
}: DepositModalProps) {
  const [token, setToken] = useState("usdc");
  const [amount, setAmount] = useState("");

  const handleDeposit = () => {
    onDeposit(token, amount);
    setAmount("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>DEPOSIT</DialogTitle>
          <DialogDescription>
            DEPOSIT TO YOUR YELLOW STATE CHANNEL
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <p className="text-[10px] tracking-wide text-muted-foreground">
            ENABLES GASLESS ORDER PLACEMENT
          </p>

          {/* TOKEN SELECTOR */}
          <div className="space-y-2">
            <Label>TOKEN</Label>
            <Select value={token} onValueChange={setToken}>
              <SelectTrigger>
                <SelectValue placeholder="SELECT TOKEN" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usdc">USDC</SelectItem>
                <SelectItem value="eth">ETH</SelectItem>
                <SelectItem value="usdt">USDT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* AMOUNT INPUT */}
          <div className="space-y-2">
            <Label>AMOUNT</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              onClick={() => setAmount(maxBalance)}
              className="text-[10px] tracking-widest text-muted-foreground hover:text-foreground transition-opacity"
            >
              MAX: {maxBalance}
            </button>
          </div>

          {/* BALANCE INFO */}
          <div className="border border-border p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">CURRENT BALANCE</span>
              <span className="font-mono">{currentBalance}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">AFTER DEPOSIT</span>
              <span className="font-mono">
                {amount
                  ? `$${(parseFloat(currentBalance.replace(/[$,]/g, "")) + parseFloat(amount || "0")).toLocaleString()}`
                  : "—"}
              </span>
            </div>
          </div>

          {/* NOTICES */}
          <div className="space-y-2 text-[10px] tracking-wide text-muted-foreground">
            <div className="flex items-start gap-2">
              <span>!</span>
              <span>DEPOSITS REQUIRE AN ON-CHAIN TRANSACTION</span>
            </div>
            <div className="flex items-start gap-2">
              <span>*</span>
              <span>ONCE DEPOSITED, ALL ORDER UPDATES ARE FREE</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            className="w-full"
            onClick={handleDeposit}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            DEPOSIT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface WithdrawModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: string;
  onWithdraw: (token: string, amount: string) => void;
}

export function WithdrawModal({
  open,
  onOpenChange,
  currentBalance,
  onWithdraw,
}: WithdrawModalProps) {
  const [token, setToken] = useState("usdc");
  const [amount, setAmount] = useState("");

  const handleWithdraw = () => {
    onWithdraw(token, amount);
    setAmount("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>WITHDRAW</DialogTitle>
          <DialogDescription>
            WITHDRAW FROM YOUR YELLOW STATE CHANNEL
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {/* TOKEN SELECTOR */}
          <div className="space-y-2">
            <Label>TOKEN</Label>
            <Select value={token} onValueChange={setToken}>
              <SelectTrigger>
                <SelectValue placeholder="SELECT TOKEN" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usdc">USDC</SelectItem>
                <SelectItem value="eth">ETH</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* AMOUNT INPUT */}
          <div className="space-y-2">
            <Label>AMOUNT</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              onClick={() => setAmount(currentBalance.replace(/[$,]/g, ""))}
              className="text-[10px] tracking-widest text-muted-foreground hover:text-foreground transition-opacity"
            >
              MAX: {currentBalance}
            </button>
          </div>

          {/* BALANCE INFO */}
          <div className="border border-border p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">CURRENT BALANCE</span>
              <span className="font-mono">{currentBalance}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="tracking-widest text-muted-foreground">AFTER WITHDRAW</span>
              <span className="font-mono">
                {amount
                  ? `$${Math.max(0, parseFloat(currentBalance.replace(/[$,]/g, "")) - parseFloat(amount || "0")).toLocaleString()}`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            className="w-full"
            onClick={handleWithdraw}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            WITHDRAW
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
