"use client";

import { Badge } from "@/components/ui";
import { Navbar, ZebraLoaderDots } from "@/components/zebra";
import { useBackend } from "@/hooks/use-backend";

function formatUptime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}H ${mins % 60}M`;
  if (mins > 0) return `${mins}M ${secs % 60}S`;
  return `${secs}S`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}

function truncate(hex: string, len = 14): string {
  if (!hex) return "\u2014";
  if (hex.length <= len) return hex;
  return hex.slice(0, len) + "...";
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

export default function TeePage() {
  const { teeMetrics, teeAttestations, logs } = useBackend();

  const metrics = teeMetrics.data;
  const attestations = teeAttestations.data || [];
  const logEntries = logs.data || [];

  const isLoading = teeMetrics.isLoading;
  const isError = teeMetrics.isError;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-lg tracking-widest mb-2">TEE DASHBOARD</h1>
          <p className="text-xs tracking-wide text-muted-foreground">
            TRUSTED EXECUTION ENVIRONMENT {"\u2014"} MATCHING ENGINE STATUS
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-4">
              <ZebraLoaderDots />
              <p className="text-xs tracking-widest text-muted-foreground">
                CONNECTING TO TEE...
              </p>
            </div>
          </div>
        )}

        {isError && (
          <div className="border border-red-500/20 p-6 text-center">
            <p className="text-xs tracking-widest text-red-500">
              BACKEND UNREACHABLE
            </p>
            <p className="text-[10px] tracking-wide text-muted-foreground mt-2">
              ENSURE THE BACKEND IS RUNNING ON PORT 3001
            </p>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="space-y-8">
            {/* TEE IDENTITY */}
            <div className="border border-border">
              <div className="p-4 border-b border-border">
                <span className="text-xs tracking-widest text-muted-foreground">
                  TEE IDENTITY
                </span>
              </div>
              <div className="p-6 grid md:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] tracking-widest text-muted-foreground">
                    MODE
                  </span>
                  <div className="mt-1">
                    <Badge variant={metrics?.teeMode === "enclave" ? "buy" : "hidden"}>
                      {metrics?.teeMode?.toUpperCase() || "UNKNOWN"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] tracking-widest text-muted-foreground">
                    UPTIME
                  </span>
                  <p className="font-mono text-sm mt-1">
                    {metrics ? formatUptime(metrics.uptime) : "\u2014"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] tracking-widest text-muted-foreground">
                    PUBLIC KEY
                  </span>
                  <p className="font-mono text-[10px] mt-1 break-all">
                    {metrics?.publicKey || "\u2014"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] tracking-widest text-muted-foreground">
                    MATCHER ADDRESS
                  </span>
                  <p className="font-mono text-[10px] mt-1 break-all">
                    {metrics?.matcherAddress || "\u2014"}
                  </p>
                </div>
              </div>
            </div>

            {/* LIVE METRICS */}
            <div className="border border-border">
              <div className="p-4 border-b border-border">
                <span className="text-xs tracking-widest text-muted-foreground">
                  LIVE METRICS
                </span>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricBox
                  label="ORDERS"
                  value={metrics?.metrics.ordersReceived ?? 0}
                />
                <MetricBox
                  label="MATCHES"
                  value={metrics?.metrics.matchesFound ?? 0}
                />
                <MetricBox
                  label="SETTLED"
                  value={metrics?.metrics.settlementsExecuted ?? 0}
                />
                <MetricBox
                  label="VOLUME"
                  value={
                    metrics
                      ? `${(metrics.metrics.totalVolumeSettled / 1e9).toFixed(2)} SUI`
                      : "0"
                  }
                />
              </div>
            </div>

            {/* ORDER BOOK STATUS */}
            <div className="border border-border">
              <div className="p-4 border-b border-border">
                <span className="text-xs tracking-widest text-muted-foreground">
                  ORDER BOOK STATUS
                </span>
              </div>
              <div className="p-6 flex items-center gap-8">
                <div className="text-xs tracking-widest">
                  BIDS:{" "}
                  <span className="font-mono">
                    {metrics?.orderBook.bids ?? 0}
                  </span>
                </div>
                <div className="text-xs tracking-widest">
                  ASKS:{" "}
                  <span className="font-mono">
                    {metrics?.orderBook.asks ?? 0}
                  </span>
                </div>
                <div className="text-xs tracking-widest">
                  PENDING:{" "}
                  <span className="font-mono">
                    {metrics?.orderBook.pendingDecryption ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* TRUST BADGES */}
            <div className="border border-border">
              <div className="p-4 border-b border-border">
                <span className="text-xs tracking-widest text-muted-foreground">
                  TRUST BADGES
                </span>
              </div>
              <div className="p-6 space-y-3">
                <TrustBadge
                  checked
                  label="TAMPER-PROOF MATCHING"
                  description="ALL MATCHES SIGNED BY TEE KEY"
                />
                <TrustBadge
                  checked={(metrics?.metrics.settlementsExecuted ?? 0) > 0}
                  label="ALL SETTLEMENTS SIGNED"
                  description="ON-CHAIN SETTLEMENT WITH ZK VERIFICATION"
                />
                <TrustBadge
                  checked
                  label="PRIVACY PRESERVED"
                  description="ORDER DETAILS NEVER EXPOSED VIA API"
                />
                <TrustBadge
                  checked={metrics?.teeMode === "enclave"}
                  label="HARDWARE ISOLATION"
                  description="MARLIN OYSTER ENCLAVE (REQUIRES ENCLAVE MODE)"
                />
              </div>
            </div>

            {/* RECENT ATTESTATIONS */}
            <div className="border border-border">
              <div className="p-4 border-b border-border">
                <span className="text-xs tracking-widest text-muted-foreground">
                  RECENT ATTESTATIONS ({attestations.length})
                </span>
              </div>
              <div className="p-6 space-y-3">
                {attestations.length === 0 ? (
                  <p className="text-xs tracking-widest text-muted-foreground text-center py-4">
                    NO ATTESTATIONS YET
                  </p>
                ) : (
                  attestations.slice(0, 10).map((att, i) => (
                    <div
                      key={i}
                      className="border border-border p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span>{truncate(att.commitmentAPrefix)}</span>
                        <span className="text-muted-foreground">&harr;</span>
                        <span>{truncate(att.commitmentBPrefix)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground font-mono">
                          SIG: {truncate(att.signature, 20)}
                        </span>
                        <span className="text-muted-foreground tracking-widest">
                          {timeAgo(att.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ENGINE LOGS */}
            <div className="border border-border">
              <div className="p-4 border-b border-border">
                <span className="text-xs tracking-widest text-muted-foreground">
                  ENGINE LOGS ({logEntries.length})
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto bg-black/80 p-4 font-mono text-[10px] leading-relaxed">
                {logEntries.length === 0 ? (
                  <p className="text-xs tracking-widest text-muted-foreground text-center py-4">
                    NO LOGS YET
                  </p>
                ) : (
                  [...logEntries].reverse().map((entry, i) => (
                    <div key={i} className="flex gap-3 py-0.5">
                      <span className="text-muted-foreground shrink-0">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                      <span
                        className={`shrink-0 uppercase ${LEVEL_COLORS[entry.level] || "text-muted-foreground"}`}
                      >
                        [{entry.level}]
                      </span>
                      <span className="text-blue-400 shrink-0">
                        [{entry.source}]
                      </span>
                      <span className="text-gray-300 break-all">
                        {entry.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border p-4 text-center">
      <p className="text-[10px] tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-lg mt-1">{value}</p>
    </div>
  );
}

function TrustBadge({
  checked,
  label,
  description,
}: {
  checked: boolean;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs mt-0.5">
        {checked ? "[+]" : "[ ]"}
      </span>
      <div>
        <p className="text-xs tracking-widest">{label}</p>
        <p className="text-[10px] tracking-wide text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
