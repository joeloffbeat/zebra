"use client";

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

function TxLink({ digest, label }: { digest: string; label?: string }) {
  return (
    <a
      href={`https://suiscan.xyz/testnet/tx/${digest}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] font-mono text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all"
    >
      {label || digest}
    </a>
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

      <LogSection title="ZK PROOF (GROTH16)" visible={!!zkData}>
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

      <LogSection title="SEAL ENCRYPTED DATA" visible={!!sealData}>
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
        {txData?.txDigest && <TxLink digest={txData.txDigest} />}
      </LogSection>

      <LogSection title="SETTLEMENT TX" visible={!!settlementDigest}>
        {settlementDigest && <TxLink digest={settlementDigest} />}
      </LogSection>
    </div>
  );
}
