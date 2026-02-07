"use client";

import { Navbar } from "@/components/zebra";

export default function PitchPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* TITLE */}
          <div className="text-center space-y-4">
            <h1 className="text-2xl tracking-widest">ZEBRA</h1>
            <p className="text-xs tracking-widest text-muted-foreground">
              ZK DARK POOL FOR HIDDEN LIMIT ORDERS ON SUI
            </p>
          </div>

          {/* PROBLEM */}
          <div className="border border-border p-8 space-y-4">
            <div className="text-xs tracking-widest text-muted-foreground">PROBLEM</div>
            <h2 className="text-sm tracking-widest">FRONT-RUNNING IS STEALING FROM TRADERS</h2>
            <p className="text-[11px] tracking-wide text-muted-foreground leading-relaxed">
              ON-CHAIN LIMIT ORDERS ARE FULLY VISIBLE. MEV BOTS AND FRONT-RUNNERS EXPLOIT THIS
              TRANSPARENCY TO EXTRACT VALUE FROM EVERY TRADE. TRADERS HAVE NO WAY TO HIDE
              THEIR INTENT WHILE STILL TRADING ON-CHAIN.
            </p>
          </div>

          {/* SOLUTION */}
          <div className="border border-border p-8 space-y-4">
            <div className="text-xs tracking-widest text-muted-foreground">SOLUTION</div>
            <h2 className="text-sm tracking-widest">HIDE IN THE HERD</h2>
            <p className="text-[11px] tracking-wide text-muted-foreground leading-relaxed">
              ZEBRA IS A ZK DARK POOL THAT KEEPS YOUR ORDER DETAILS PRIVATE UNTIL MATCHED.
              SUBMIT ENCRYPTED LIMIT ORDERS WITH ZERO-KNOWLEDGE PROOFS. A TEE-BASED MATCHER
              FINDS COUNTERPARTIES WITHOUT REVEALING YOUR PRICE OR SIZE TO ANYONE.
            </p>
          </div>

          {/* HOW IT WORKS */}
          <div className="space-y-6">
            <div className="text-xs tracking-widest text-muted-foreground text-center">HOW IT WORKS</div>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="border border-border p-6 space-y-3 text-center">
                <div className="text-lg tracking-widest">01</div>
                <h3 className="text-xs tracking-widest">SUBMIT</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground leading-relaxed">
                  PLACE AN ENCRYPTED LIMIT ORDER WITH A ZK PROOF OF VALIDITY
                </p>
              </div>
              <div className="border border-border p-6 space-y-3 text-center">
                <div className="text-lg tracking-widest">02</div>
                <h3 className="text-xs tracking-widest">ENCRYPT</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground leading-relaxed">
                  ORDER SEALED WITH SUI SEAL ENCRYPTION &mdash; ONLY TEE CAN DECRYPT
                </p>
              </div>
              <div className="border border-border p-6 space-y-3 text-center">
                <div className="text-lg tracking-widest">03</div>
                <h3 className="text-xs tracking-widest">MATCH</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground leading-relaxed">
                  TEE DECRYPTS AND MATCHES CROSSING ORDERS IN A SECURE ENCLAVE
                </p>
              </div>
              <div className="border border-border p-6 space-y-3 text-center">
                <div className="text-lg tracking-widest">04</div>
                <h3 className="text-xs tracking-widest">SETTLE</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground leading-relaxed">
                  ATOMIC ON-CHAIN SETTLEMENT VIA DEEPBOOK V3 ON SUI
                </p>
              </div>
            </div>
          </div>

          {/* TECH STACK */}
          <div className="space-y-6">
            <div className="text-xs tracking-widest text-muted-foreground text-center">TECH STACK</div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border border-border p-6 space-y-2 text-center">
                <h3 className="text-xs tracking-widest">SUI BLOCKCHAIN</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground">
                  MOVE SMART CONTRACTS, SUI SEAL ENCRYPTION, ON-CHAIN PROOFS
                </p>
              </div>
              <div className="border border-border p-6 space-y-2 text-center">
                <h3 className="text-xs tracking-widest">MARLIN OYSTER TEE</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground">
                  TRUSTED EXECUTION FOR PRIVATE ORDER MATCHING WITH ATTESTATION
                </p>
              </div>
              <div className="border border-border p-6 space-y-2 text-center">
                <h3 className="text-xs tracking-widest">DEEPBOOK V3</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground">
                  NATIVE SUI CLOB FOR ATOMIC TRADE SETTLEMENT
                </p>
              </div>
            </div>
          </div>

          {/* TEAM */}
          <div className="border-t border-border pt-8 text-center space-y-2">
            <div className="text-xs tracking-widest text-muted-foreground">BUILT AT ETHGLOBAL</div>
            <p className="text-[10px] tracking-wide text-muted-foreground">
              PRIVACY-FIRST TRADING INFRASTRUCTURE FOR THE SUI ECOSYSTEM
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
