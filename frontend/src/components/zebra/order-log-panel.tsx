"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderLogPanelProps {
  stepData: Record<string, Record<string, string>>;
  settlementDigest?: string | null;
}

function LogSection({
  title,
  children,
  visible,
}: {
  title: string;
  children: React.ReactNode;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] tracking-widest text-muted-foreground font-bold">
        {">"} {title}
      </p>
      {children}
    </div>
  );
}

function TxRow({ label, digest }: { label: string; digest: string }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[9px] font-mono text-foreground/80 break-all flex-1">
        {digest}
      </p>
      <a
        href={`https://suiscan.xyz/testnet/tx/${digest}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 p-1 border border-border hover:bg-muted/50 transition-colors"
        title={`View ${label} on SuiScan`}
      >
        <ExternalLink className="w-3 h-3 text-blue-400" />
      </a>
    </div>
  );
}

export function OrderLogPanel({ stepData, settlementDigest }: OrderLogPanelProps) {
  const zkData = stepData["zk-proof"];
  const sealData = stepData["seal-encrypt"];
  const txData = stepData["submit-tx"];

  const hasAnyData = zkData || sealData || txData || settlementDigest;

  return (
    <div className="flex flex-col space-y-4 overflow-y-auto max-h-[400px] pr-2">
      <p className="text-[10px] tracking-widest text-muted-foreground">
        EXECUTION LOG
      </p>

      {!hasAnyData && (
        <p className="text-[9px] text-muted-foreground tracking-wide animate-pulse">
          WAITING FOR DATA...
        </p>
      )}

      <LogSection title={`ZK PROOF (GROTH16)${zkData?.durationMs ? ` \u2014 ${zkData.durationMs}ms` : ""}`} visible={!!zkData}>
        {zkData?.proof && (
          <pre className={cn(
            "text-[9px] font-mono text-foreground/80",
            "max-w-[380px] max-h-[120px] overflow-auto",
            "bg-muted/30 p-2 border border-border",
            "whitespace-pre-wrap break-all"
          )}>
            {zkData.proof}
          </pre>
        )}
        {zkData?.commitment && (
          <div className="space-y-0.5">
            <p className="text-[9px] tracking-widest text-muted-foreground">COMMITMENT</p>
            <p
              className="text-[9px] font-mono text-foreground/80 truncate max-w-[380px]"
              title={zkData.commitment}
            >
              {zkData.commitment}
            </p>
          </div>
        )}
        {zkData?.nullifier && (
          <div className="space-y-0.5">
            <p className="text-[9px] tracking-widest text-muted-foreground">NULLIFIER</p>
            <p
              className="text-[9px] font-mono text-foreground/80 truncate max-w-[380px]"
              title={zkData.nullifier}
            >
              {zkData.nullifier}
            </p>
          </div>
        )}
      </LogSection>

      <LogSection title={`SEAL ENCRYPTED DATA${sealData?.durationMs ? ` \u2014 ${sealData.durationMs}ms` : ""}`} visible={!!sealData}>
        {sealData?.encryptedHex && (
          <div
            className={cn(
              "text-[9px] font-mono text-foreground/80",
              "max-w-[380px] max-h-[80px] overflow-auto",
              "bg-muted/30 p-2 border border-border",
              "break-all"
            )}
          >
            0x{sealData.encryptedHex}
          </div>
        )}
        {sealData?.byteLength && (
          <p className="text-[9px] text-muted-foreground tracking-wide">
            {sealData.byteLength} BYTES
          </p>
        )}
      </LogSection>

      <LogSection title="ON-CHAIN TX" visible={!!txData?.txDigest}>
        {txData?.txDigest && <TxRow label="transaction" digest={txData.txDigest} />}
      </LogSection>

      <LogSection title="SETTLEMENT TX" visible={!!settlementDigest}>
        {settlementDigest && <TxRow label="settlement" digest={settlementDigest} />}
      </LogSection>
    </div>
  );
}
