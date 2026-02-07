"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { EncryptedText } from "@/components/ui/encrypted-text";

const SLIDE_IDS = [
  "title",
  "problem",
  "opportunity",
  "solution",
  "pipeline",
  "architecture",
  "receivers",
  "integration",
  "novel",
  "demo",
  "stack",
  "closing",
] as const;

const SLIDE_LABELS = [
  "TITLE",
  "PROBLEM",
  "OPPORTUNITY",
  "SOLUTION",
  "PIPELINE",
  "ARCHITECTURE",
  "RECEIVERS",
  "INTEGRATION",
  "NOVEL",
  "DEMO",
  "STACK",
  "CLOSING",
];

// ─── Intersection Observer hook for slide animations ────────────────────────

function useSlideInView(onInView?: () => void) {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          onInView?.();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onInView]);

  return { ref, isVisible };
}

// ─── Animated element with stagger delay ────────────────────────────────────

function FadeIn({
  children,
  isVisible,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  isVisible: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`transition-all duration-700 ${className}`}
      style={{
        transitionDelay: `${delay}ms`,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(24px)",
      }}
    >
      {children}
    </div>
  );
}

// ─── Slide wrapper ──────────────────────────────────────────────────────────

function Slide({
  id,
  children,
  inverted = false,
  onInView,
  className = "",
}: {
  id: string;
  children: (isVisible: boolean) => ReactNode;
  inverted?: boolean;
  onInView?: () => void;
  className?: string;
}) {
  const { ref, isVisible } = useSlideInView(onInView);

  return (
    <section
      ref={ref}
      id={id}
      className={`min-h-screen flex items-center justify-center px-8 py-28 ${
        inverted
          ? "bg-foreground text-background"
          : "bg-background text-foreground"
      } ${className}`}
    >
      <div className="w-full max-w-6xl mx-auto">{children(isVisible)}</div>
    </section>
  );
}

// ─── Encrypted text helpers ─────────────────────────────────────────────────

// Short labels / section tags
function ELabel({ text }: { text: string }) {
  return (
    <EncryptedText
      text={text}
      encryptedClassName="opacity-40"
      revealDelayMs={40}
    />
  );
}

// Subtitles and mid-length text
function ESub({ text }: { text: string }) {
  return (
    <EncryptedText
      text={text}
      encryptedClassName="opacity-30"
      revealDelayMs={25}
    />
  );
}

// Longer descriptions / body text
function EDesc({ text }: { text: string }) {
  return (
    <EncryptedText
      text={text}
      encryptedClassName="opacity-30"
      revealDelayMs={15}
    />
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function PitchPage() {
  const [activeSlide, setActiveSlide] = useState(0);

  const scrollToSlide = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="bg-background relative">
      {/* ── Progress bar ── */}
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-border z-50">
        <div
          className="h-full bg-foreground transition-all duration-500 ease-out"
          style={{
            width: `${(activeSlide / (SLIDE_IDS.length - 1)) * 100}%`,
          }}
        />
      </div>

      {/* ── Side navigation dots ── */}
      <nav className="fixed right-8 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col items-center gap-3">
        {SLIDE_IDS.map((id, i) => (
          <button
            key={id}
            onClick={() => scrollToSlide(id)}
            className={`w-[6px] h-[6px] border transition-all duration-300 ${
              activeSlide === i
                ? "bg-foreground border-foreground scale-150"
                : "bg-transparent border-muted-foreground hover:border-foreground"
            }`}
            title={SLIDE_LABELS[i]}
          />
        ))}
      </nav>

      {/* ── Slide counter ── */}
      <div className="fixed left-8 bottom-8 z-50 hidden md:block">
        <span className="text-[13px] tracking-widest text-muted-foreground font-mono">
          {String(activeSlide + 1).padStart(2, "0")} / {SLIDE_IDS.length}
        </span>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 1: TITLE
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="title" onInView={() => setActiveSlide(0)}>
        {(isVisible) => (
          <div className="text-center space-y-10">
            <FadeIn isVisible={isVisible} delay={0}>
              <div className="text-[15px] tracking-[0.3em] text-muted-foreground">
                <ELabel text="ETHGLOBAL HACKMONEY 2026" />
              </div>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={200}>
              <h1 className="text-[80px] md:text-[130px] tracking-[0.2em] font-display leading-none">
                ZEBRA
              </h1>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={400}>
              <div className="w-20 h-px bg-foreground mx-auto" />
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={600}>
              <p className="text-[22px] md:text-[28px] tracking-[0.15em]">
                <ESub text="THE FIRST ZK DARK POOL ON SUI" />
              </p>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={800}>
              <p className="text-[14px] tracking-widest text-muted-foreground">
                <EDesc text="PRIVATE LIMIT ORDERS · ENCRYPTED SETTLEMENT · ZERO ON-CHAIN LEAKAGE" />
              </p>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={1000}>
              <div className="pt-10">
                <span className="text-[13px] tracking-widest text-muted-foreground animate-pulse">
                  <ELabel text="SCROLL TO EXPLORE" />
                </span>
              </div>
            </FadeIn>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 2: THE PROBLEM
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="problem" inverted onInView={() => setActiveSlide(1)}>
        {(isVisible) => (
          <div className="space-y-14">
            <div className="space-y-5">
              <FadeIn isVisible={isVisible} delay={0}>
                <div className="text-[15px] tracking-[0.3em] opacity-50">
                  <ELabel text="THE PROBLEM" />
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={150}>
                <h2 className="text-[36px] md:text-[56px] tracking-widest font-display leading-tight">
                  EVERY TRADE ON SUI
                  <br />
                  IS FULLY TRANSPARENT
                </h2>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={300}>
                <p className="text-[16px] tracking-wide opacity-60 leading-relaxed max-w-3xl">
                  <EDesc text="WHEN YOU PLACE AN ORDER ON DEEPBOOK, YOUR LIMIT PRICE, ORDER SIZE, WALLET ADDRESS, AND TRADE HISTORY ARE VISIBLE TO THE ENTIRE NETWORK." />
                </p>
              </FadeIn>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <FadeIn isVisible={isVisible} delay={450}>
                <div className="border border-current/20 p-8 space-y-4">
                  <div className="text-[16px] tracking-widest opacity-40">01</div>
                  <h3 className="text-[18px] tracking-widest">
                    ORDER BOOK EXPOSURE
                  </h3>
                  <p className="text-[14px] tracking-wide opacity-50 leading-relaxed">
                    <EDesc text="YOUR LIMIT PRICE, ORDER SIZE, AND WALLET ADDRESS ARE VISIBLE TO EVERYONE. ANYONE CAN QUERY DEEPBOOK AND SEE EXACTLY WHAT YOU'RE DOING." />
                  </p>
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={600}>
                <div className="border border-current/20 p-8 space-y-4">
                  <div className="text-[16px] tracking-widest opacity-40">02</div>
                  <h3 className="text-[18px] tracking-widest">MARKET IMPACT</h3>
                  <p className="text-[14px] tracking-wide opacity-50 leading-relaxed">
                    <EDesc text="A WHALE PLACING A LARGE SELL ORDER MOVES THE MARKET BEFORE IT FILLS. THE PRICE SHIFTS AGAINST YOU BEFORE EXECUTION." />
                  </p>
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={750}>
                <div className="border border-current/20 p-8 space-y-4">
                  <div className="text-[16px] tracking-widest opacity-40">03</div>
                  <h3 className="text-[18px] tracking-widest">STRATEGY LEAKAGE</h3>
                  <p className="text-[14px] tracking-wide opacity-50 leading-relaxed">
                    <EDesc text="YOUR ON-CHAIN TRADING HISTORY IS PUBLIC. COMPETITORS TRACK YOUR ADDRESSES, COPY YOUR STRATEGIES, AND TRADE AGAINST YOU." />
                  </p>
                </div>
              </FadeIn>
            </div>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 3: THE OPPORTUNITY
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="opportunity" onInView={() => setActiveSlide(2)}>
        {(isVisible) => (
          <div className="space-y-16">
            <FadeIn isVisible={isVisible} delay={0}>
              <div className="text-[15px] tracking-[0.3em] text-muted-foreground text-center">
                <ELabel text="THE OPPORTUNITY" />
              </div>
            </FadeIn>

            <div className="grid md:grid-cols-2 gap-12 md:gap-0 md:divide-x divide-border">
              <FadeIn isVisible={isVisible} delay={200}>
                <div className="text-center space-y-5 md:pr-16">
                  <div className="text-[72px] md:text-[100px] tracking-widest font-display leading-none">
                    $3T+
                  </div>
                  <div className="w-10 h-px bg-foreground mx-auto" />
                  <p className="text-[16px] tracking-widest text-muted-foreground">
                    <ESub text="ANNUAL VOLUME IN TRADFI DARK POOLS" />
                  </p>
                  <p className="text-[14px] tracking-wide text-muted-foreground opacity-60">
                    <EDesc text="IEX · LIQUIDNET · CROSSFINDER · SIGMA X" />
                  </p>
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={500}>
                <div className="text-center space-y-5 md:pl-16">
                  <div className="text-[72px] md:text-[100px] tracking-widest font-display leading-none">
                    0
                  </div>
                  <div className="w-10 h-px bg-foreground mx-auto" />
                  <p className="text-[16px] tracking-widest text-muted-foreground">
                    <ESub text="PRIVACY DEXS ON SUI" />
                  </p>
                  <p className="text-[14px] tracking-wide text-muted-foreground opacity-60">
                    <EDesc text="DEEPBOOK · CETUS · TURBOS · KRIYA — ALL TRANSPARENT" />
                  </p>
                </div>
              </FadeIn>
            </div>

            <FadeIn isVisible={isVisible} delay={700}>
              <p className="text-center text-[16px] tracking-widest text-muted-foreground">
                <ESub text="TRADITIONAL FINANCE SOLVED THIS DECADES AGO. SUI HAS NO EQUIVALENT." />
              </p>
            </FadeIn>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 4: THE SOLUTION
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="solution" onInView={() => setActiveSlide(3)}>
        {(isVisible) => (
          <div className="text-center space-y-12">
            <FadeIn isVisible={isVisible} delay={0}>
              <div className="text-[15px] tracking-[0.3em] text-muted-foreground">
                <ELabel text="THE SOLUTION" />
              </div>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={200}>
              <h2 className="text-[40px] md:text-[64px] tracking-[0.15em] font-display leading-tight">
                HIDE IN THE HERD
              </h2>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={400}>
              <div className="w-20 h-px bg-foreground mx-auto" />
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={600}>
              <p className="text-[16px] md:text-[18px] tracking-wide text-muted-foreground leading-relaxed max-w-3xl mx-auto">
                <EDesc text="ZEBRA ENABLES PRIVATE LIMIT ORDERS WHERE PRICES ARE HIDDEN, MATCHING HAPPENS INSIDE A SECURE ENCLAVE, AND SETTLEMENT ROUTES FUNDS TO ENCRYPTED RECEIVER ADDRESSES — BREAKING EVERY LINK BETWEEN ORDER PLACEMENT AND FUND RECEIPT." />
              </p>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={800}>
              <div className="flex flex-col md:flex-row items-center justify-center gap-6 pt-4">
                <div className="border border-border px-8 py-4 space-y-2">
                  <div className="text-[13px] tracking-widest text-muted-foreground">
                    <ELabel text="INPUT" />
                  </div>
                  <div className="text-[16px] tracking-widest">
                    <ESub text="ENCRYPTED ORDER + ZK PROOF" />
                  </div>
                </div>
                <div className="text-muted-foreground text-2xl hidden md:block">→</div>
                <div className="text-muted-foreground text-2xl md:hidden">↓</div>
                <div className="border border-border px-8 py-4 space-y-2">
                  <div className="text-[13px] tracking-widest text-muted-foreground">
                    <ELabel text="ON-CHAIN" />
                  </div>
                  <div className="text-[16px] tracking-widest">
                    <ESub text="COMMITMENT HASH ONLY" />
                  </div>
                </div>
                <div className="text-muted-foreground text-2xl hidden md:block">→</div>
                <div className="text-muted-foreground text-2xl md:hidden">↓</div>
                <div className="border border-border px-8 py-4 space-y-2">
                  <div className="text-[13px] tracking-widest text-muted-foreground">
                    <ELabel text="OUTPUT" />
                  </div>
                  <div className="text-[16px] tracking-widest">
                    <ESub text="FUNDS AT UNRELATED ADDRESSES" />
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 5: SIX PRIVACY LAYERS
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="pipeline" inverted onInView={() => setActiveSlide(4)}>
        {(isVisible) => (
          <div className="space-y-14">
            <div className="text-center space-y-5">
              <FadeIn isVisible={isVisible} delay={0}>
                <div className="text-[15px] tracking-[0.3em] opacity-50">
                  <ELabel text="THE PIPELINE" />
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={150}>
                <h2 className="text-[36px] md:text-[56px] tracking-widest font-display">
                  SIX PRIVACY LAYERS
                </h2>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={300}>
                <p className="text-[14px] tracking-wide opacity-50 max-w-2xl mx-auto leading-relaxed">
                  <EDesc text="EACH LAYER ADDRESSES A DIFFERENT PRIVACY VECTOR. TOGETHER THEY COVER VALIDITY, CONFIDENTIALITY, EXECUTION, OPACITY, LIQUIDITY, AND UNLINKABILITY." />
                </p>
              </FadeIn>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  num: "01",
                  title: "ZK PROOF",
                  desc: "GROTH16 PROOF GENERATED IN-BROWSER VALIDATES ORDER WITHOUT REVEALING PRICE, AMOUNT, OR SIDE",
                  tag: "VALIDITY",
                },
                {
                  num: "02",
                  title: "SEAL ENCRYPTION",
                  desc: "ORDER DATA ENCRYPTED WITH SUI SEAL THRESHOLD ENCRYPTION (2-OF-3 KEY SERVERS). ONLY TEE CAN DECRYPT",
                  tag: "CONFIDENTIALITY",
                },
                {
                  num: "03",
                  title: "ON-CHAIN COMMITMENT",
                  desc: "SMART CONTRACT STORES ONLY COMMITMENT HASH AND ENCRYPTED BLOB. NO AMOUNTS, NO ADDRESSES, NO SIDE",
                  tag: "OPACITY",
                },
                {
                  num: "04",
                  title: "TEE MATCHING",
                  desc: "TEE ENCLAVE DECRYPTS ORDERS AND RUNS PRICE-TIME PRIORITY MATCHING IN 60-SECOND BATCHES",
                  tag: "EXECUTION",
                },
                {
                  num: "05",
                  title: "FLASH LOAN SETTLEMENT",
                  desc: "UNMATCHED ORDERS AUTO-SETTLE VIA DEEPBOOK V3 FLASH LOANS USING THE HOT POTATO PATTERN",
                  tag: "LIQUIDITY",
                },
                {
                  num: "06",
                  title: "ENCRYPTED RECEIVERS",
                  desc: "FUNDS ROUTED TO HIDDEN ADDRESSES WITH PERCENTAGE SPLITS. ONLY THE TEE KNOWS WHERE FUNDS GO",
                  tag: "UNLINKABILITY",
                },
              ].map((layer, i) => (
                <FadeIn key={layer.num} isVisible={isVisible} delay={450 + i * 100}>
                  <div className="border border-current/20 p-6 space-y-4 h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-[16px] tracking-widest opacity-40">
                        {layer.num}
                      </span>
                      <span className="text-[12px] tracking-widest opacity-30 border border-current/20 px-3 py-1">
                        <ELabel text={layer.tag} />
                      </span>
                    </div>
                    <h3 className="text-[18px] tracking-widest">{layer.title}</h3>
                    <p className="text-[14px] tracking-wide opacity-50 leading-relaxed">
                      <EDesc text={layer.desc} />
                    </p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 6: ARCHITECTURE
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="architecture" onInView={() => setActiveSlide(5)}>
        {(isVisible) => (
          <div className="space-y-14">
            <div className="text-center space-y-5">
              <FadeIn isVisible={isVisible} delay={0}>
                <div className="text-[15px] tracking-[0.3em] text-muted-foreground">
                  <ELabel text="ARCHITECTURE" />
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={150}>
                <h2 className="text-[36px] md:text-[56px] tracking-widest font-display">
                  FULL SUI-NATIVE STACK
                </h2>
              </FadeIn>
            </div>

            {/* Architecture diagram */}
            <div className="space-y-6">
              {/* Browser layer */}
              <FadeIn isVisible={isVisible} delay={300}>
                <div className="border border-border p-8">
                  <div className="text-[14px] tracking-[0.3em] text-muted-foreground mb-5">
                    <ELabel text="BROWSER" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="border border-border/50 p-4 text-center">
                      <div className="text-[15px] tracking-widest">
                        <ESub text="GROTH16 PROOF" />
                      </div>
                      <div className="text-[13px] tracking-wide text-muted-foreground mt-2">
                        <EDesc text="CIRCOM · SNARKJS" />
                      </div>
                    </div>
                    <div className="border border-border/50 p-4 text-center">
                      <div className="text-[15px] tracking-widest">
                        <ESub text="SEAL ENCRYPT" />
                      </div>
                      <div className="text-[13px] tracking-wide text-muted-foreground mt-2">
                        <EDesc text="SUI SEAL SDK" />
                      </div>
                    </div>
                    <div className="border border-border/50 p-4 text-center">
                      <div className="text-[15px] tracking-widest">
                        <ESub text="WALLET" />
                      </div>
                      <div className="text-[13px] tracking-wide text-muted-foreground mt-2">
                        <EDesc text="DAPP-KIT" />
                      </div>
                    </div>
                  </div>
                </div>
              </FadeIn>

              {/* Arrow */}
              <FadeIn isVisible={isVisible} delay={450}>
                <div className="flex justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-px h-5 bg-border" />
                    <div className="text-[13px] tracking-widest text-muted-foreground">
                      <ELabel text="SUBMIT TX" />
                    </div>
                    <div className="w-px h-5 bg-border" />
                    <div className="text-muted-foreground text-lg">↓</div>
                  </div>
                </div>
              </FadeIn>

              {/* On-chain layer */}
              <FadeIn isVisible={isVisible} delay={550}>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="border border-border p-8">
                    <div className="text-[14px] tracking-[0.3em] text-muted-foreground mb-5">
                      <ELabel text="DARK POOL CONTRACT (MOVE)" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        "ZK VERIFY",
                        "VAULT LOCK",
                        "NULLIFIERS",
                        "SETTLEMENT",
                      ].map((item) => (
                        <div
                          key={item}
                          className="border border-border/50 p-3 text-center text-[14px] tracking-widest"
                        >
                          <ESub text={item} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-border p-8">
                    <div className="text-[14px] tracking-[0.3em] text-muted-foreground mb-5">
                      <ELabel text="DEEPBOOK V3" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        "FLASH LOANS",
                        "SUI <> DBUSDC",
                        "MID-PRICE",
                        "HOT POTATO",
                      ].map((item) => (
                        <div
                          key={item}
                          className="border border-border/50 p-3 text-center text-[14px] tracking-widest"
                        >
                          <ESub text={item} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </FadeIn>

              {/* Arrow */}
              <FadeIn isVisible={isVisible} delay={650}>
                <div className="flex justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-muted-foreground text-lg">↑</div>
                    <div className="w-px h-5 bg-border" />
                    <div className="text-[13px] tracking-widest text-muted-foreground">
                      <ELabel text="EVENTS · PTBS" />
                    </div>
                    <div className="w-px h-5 bg-border" />
                    <div className="text-muted-foreground text-lg">↓</div>
                  </div>
                </div>
              </FadeIn>

              {/* TEE layer */}
              <FadeIn isVisible={isVisible} delay={750}>
                <div className="border border-border p-8">
                  <div className="text-[14px] tracking-[0.3em] text-muted-foreground mb-5">
                    <ELabel text="TEE MATCHING ENGINE (NAUTILUS-READY)" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      "SEAL DECRYPT",
                      "ORDER BOOK",
                      "BATCH MATCH",
                      "ATTESTATION",
                    ].map((item) => (
                      <div
                        key={item}
                        className="border border-border/50 p-3 text-center text-[14px] tracking-widest"
                      >
                        <ESub text={item} />
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 7: ENCRYPTED RECEIVER ROUTING
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="receivers" inverted onInView={() => setActiveSlide(6)}>
        {(isVisible) => (
          <div className="space-y-14">
            <div className="space-y-5">
              <FadeIn isVisible={isVisible} delay={0}>
                <div className="text-[15px] tracking-[0.3em] opacity-50">
                  <ELabel text="CORE DIFFERENTIATOR" />
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={150}>
                <h2 className="text-[36px] md:text-[56px] tracking-widest font-display leading-tight">
                  ENCRYPTED RECEIVER
                  <br />
                  ROUTING
                </h2>
              </FadeIn>

            </div>

            {/* WITHOUT ZEBRA — simple linear link */}
            <FadeIn isVisible={isVisible} delay={450}>
              <div className="border border-current/20 p-8">
                <div className="text-[13px] tracking-[0.3em] opacity-40 mb-6">
                  <ELabel text="WITHOUT ZEBRA" />
                </div>
                <div className="flex items-center justify-center gap-6 font-mono">
                  <span className="text-[15px] tracking-wide border border-current/20 px-4 py-2">
                    <ESub text="0xAAA" />
                  </span>
                  <span className="text-[16px] opacity-30">→</span>
                  <span className="text-[14px] opacity-40">
                    <ESub text="PLACES ORDER" />
                  </span>
                  <span className="text-[16px] opacity-30">→</span>
                  <span className="text-[15px] tracking-wide border border-current/20 px-4 py-2">
                    <ESub text="0xAAA" />
                  </span>
                  <span className="text-[14px] opacity-40">
                    <ESub text="RECEIVES FUNDS" />
                  </span>
                </div>
                <div className="text-center mt-5">
                  <span className="text-[13px] tracking-widest opacity-30">
                    <ESub text="SAME ADDRESS — TRIVIALLY LINKED" />
                  </span>
                </div>
              </div>
            </FadeIn>

            {/* WITH ZEBRA — horizontal branching */}
            <FadeIn isVisible={isVisible} delay={650}>
              <div className="border border-current/40 p-8">
                <div className="text-[13px] tracking-[0.3em] mb-8">
                  <ELabel text="WITH ZEBRA" />
                </div>
                <div className="flex items-center justify-center font-mono">
                  {/* Source */}
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-[15px] tracking-wide border border-current/30 px-4 py-2">
                      <ESub text="0xAAA" />
                    </span>
                    <span className="text-[14px] opacity-50">
                      <ESub text="PLACES ORDER" />
                    </span>
                  </div>

                  {/* Branching arrows */}
                  <div className="flex flex-col items-start mx-6 shrink-0">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i}>
                        <div className="flex items-center">
                          <div className="w-10 h-px bg-current/30" />
                          <div className="w-2.5 h-2.5 border-t border-r border-current/30 -rotate-45 -ml-1.5" />
                        </div>
                        {i < 4 && <div className="w-px h-3 bg-current/30 ml-0" />}
                      </div>
                    ))}
                  </div>

                  {/* Receivers */}
                  <div className="flex flex-col gap-2">
                    {[
                      { addr: "0xB1F", pct: "30%" },
                      { addr: "0xC7A", pct: "25%" },
                      { addr: "0xD3E", pct: "20%" },
                      { addr: "0xE9C", pct: "15%" },
                      { addr: "0xF2D", pct: "10%" },
                    ].map((r) => (
                      <div key={r.addr} className="flex items-center gap-3">
                        <span className="text-[14px] tracking-wide border border-current/30 px-3 py-1">
                          <ESub text={r.addr} />
                        </span>
                        <span className="text-[13px] opacity-50">
                          <ESub text={r.pct} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-center mt-6">
                  <span className="text-[13px] tracking-widest">
                    <ESub text="NO VISIBLE LINK BETWEEN TRADER AND RECIPIENTS" />
                  </span>
                </div>
              </div>
            </FadeIn>

          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 8: DEEP SUI INTEGRATION
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="integration" onInView={() => setActiveSlide(7)}>
        {(isVisible) => (
          <div className="space-y-14">
            <div className="text-center space-y-5">
              <FadeIn isVisible={isVisible} delay={0}>
                <div className="text-[15px] tracking-[0.3em] text-muted-foreground">
                  <ELabel text="ECOSYSTEM" />
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={150}>
                <h2 className="text-[36px] md:text-[56px] tracking-widest font-display">
                  DEEP SUI INTEGRATION
                </h2>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={300}>
                <p className="text-[14px] tracking-wide text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  <EDesc text="EVERY CORE COMPONENT LEVERAGES A SUI-NATIVE PRIMITIVE. NO EXTERNAL CHAINS, NO BRIDGES, NO THIRD-PARTY INFRASTRUCTURE." />
                </p>
              </FadeIn>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "SUI MOVE + GROTH16",
                  desc: "NATIVE ON-CHAIN ZK PROOF VERIFICATION USING SUI::GROTH16 MODULE. POSEIDON HASH COMMITMENTS WITH NULLIFIER TRACKING. MATCHERCAP CAPABILITY PATTERN FOR TEE AUTHORIZATION.",
                  tag: "VERIFICATION",
                },
                {
                  title: "SUI SEAL",
                  desc: "THRESHOLD ENCRYPTION WITH 2-OF-3 KEY SERVERS ON TESTNET. ENCRYPTION TIED TO A SEAL ALLOWLIST — ONLY AUTHORIZED TEE INSTANCES CAN DECRYPT. NO CENTRALIZED KEY SERVER.",
                  tag: "ENCRYPTION",
                },
                {
                  title: "DEEPBOOK V3",
                  desc: "FLASH LOAN BORROWING VIA HOT POTATO PATTERN. BORROW, SWAP, SETTLE, REPAY IN A SINGLE PTB. THE FLASH LOAN OBJECT HAS NO DROP ABILITY — FORCING ATOMIC EXECUTION.",
                  tag: "LIQUIDITY",
                },
                {
                  title: "NAUTILUS TEE",
                  desc: "MATCHING ENGINE BUILT FOR NAUTILUS TEE WITH HARDWARE ATTESTATION. SECP256K1 SIGNING. RUNNING IN LOCAL-DEV MODE FOR HACKATHON.",
                  tag: "EXECUTION",
                },
              ].map((item, i) => (
                <FadeIn key={item.title} isVisible={isVisible} delay={450 + i * 150}>
                  <div className="border border-border p-8 space-y-4 h-full">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[18px] tracking-widest">{item.title}</h3>
                      <span className="text-[12px] tracking-widest text-muted-foreground border border-border px-3 py-1">
                        <ELabel text={item.tag} />
                      </span>
                    </div>
                    <p className="text-[14px] tracking-wide text-muted-foreground leading-relaxed">
                      <EDesc text={item.desc} />
                    </p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 9: WHAT'S NOVEL
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="novel" inverted onInView={() => setActiveSlide(8)}>
        {(isVisible) => (
          <div className="space-y-14">
            <div className="space-y-5">
              <FadeIn isVisible={isVisible} delay={0}>
                <div className="text-[15px] tracking-[0.3em] opacity-50">
                  <ELabel text="INNOVATION" />
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={150}>
                <h2 className="text-[36px] md:text-[56px] tracking-widest font-display">
                  {"WHAT'S NOVEL"}
                </h2>
              </FadeIn>
            </div>

            <div className="space-y-8">
              {[
                {
                  title: "FIRST PRIVACY DEX ON SUI",
                  desc: "NO DARK POOL OR PRIVACY-PRESERVING TRADING MECHANISM EXISTS ON THE SUI NETWORK TODAY.",
                },
                {
                  title: "SIX-LAYER PRIVACY PIPELINE",
                  desc: "ZK PROOFS, SEAL ENCRYPTION, TEE MATCHING, COMMITMENT-ONLY EVENTS, FLASH LOAN SETTLEMENT, AND ENCRYPTED RECEIVER ROUTING. EACH ADDRESSES A DIFFERENT VECTOR.",
                },
                {
                  title: "ENCRYPTED RECEIVER ROUTING WITH SPLITS",
                  desc: "THE ENTIRE SETTLEMENT PATH IS PRIVATE. USERS SPECIFY RECEIVERS AND SPLIT PERCENTAGES INSIDE THE ENCRYPTED PAYLOAD. ONLY THE TEE KNOWS THE ROUTING.",
                },
                {
                  title: "FLASH LOAN AUTO-SETTLEMENT",
                  desc: "ORDERS DON'T WAIT INDEFINITELY. AFTER 60-SECOND BATCH MATCHING, RESIDUALS AUTO-FILL VIA DEEPBOOK FLASH LOANS. THE HOT POTATO PATTERN ENSURES ATOMICITY.",
                },
                {
                  title: "FULL SUI-NATIVE STACK",
                  desc: "EVERY PRIVACY PRIMITIVE — GROTH16, SEAL, NAUTILUS, DEEPBOOK — IS NATIVE TO SUI. NO EXTERNAL CHAINS, NO BRIDGES FOR CORE FUNCTIONALITY.",
                },
              ].map((item, i) => (
                <FadeIn key={item.title} isVisible={isVisible} delay={300 + i * 120}>
                  <div className="flex gap-8 items-start">
                    <div className="text-[24px] tracking-widest opacity-30 pt-0.5 shrink-0 w-10 font-mono">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="border-l border-current/20 pl-8 space-y-3">
                      <h3 className="text-[18px] tracking-widest">{item.title}</h3>
                      <p className="text-[14px] tracking-wide opacity-50 leading-relaxed max-w-3xl">
                        <EDesc text={item.desc} />
                      </p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 10: DEMO FLOW
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="demo" onInView={() => setActiveSlide(9)}>
        {(isVisible) => (
          <div className="space-y-14">
            <div className="text-center space-y-5">
              <FadeIn isVisible={isVisible} delay={0}>
                <div className="text-[15px] tracking-[0.3em] text-muted-foreground">
                  <ELabel text="LIVE DEMO" />
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={150}>
                <h2 className="text-[36px] md:text-[56px] tracking-widest font-display">
                  A COMPLETE PRIVATE TRADE
                </h2>
              </FadeIn>
            </div>

            <div className="grid md:grid-cols-2 gap-x-10 gap-y-8">
              {[
                {
                  step: "01",
                  title: "CONNECT WALLET",
                  desc: "SUI AND DBUSDC BALANCES DISPLAYED. READY TO TRADE.",
                },
                {
                  step: "02",
                  title: "PLACE SELL ORDER",
                  desc: "SET CUSTOM RECEIVER ADDRESS. WATCH ZK PROOF GENERATE IN-BROWSER, SEAL ENCRYPT, AND SUBMIT ON-CHAIN. CHECK EXPLORER: ONLY HASH VISIBLE.",
                },
                {
                  step: "03",
                  title: "PLACE BUY ORDER",
                  desc: "FROM A SECOND WALLET. SAME PIPELINE — PROOF, ENCRYPT, COMMIT. TWO ORDERS IN THE POOL, ZERO DETAILS VISIBLE.",
                },
                {
                  step: "04",
                  title: "TEE PROCESSES",
                  desc: "OPEN THE TEE DASHBOARD. WATCH ORDERS DETECTED, DECRYPTED INSIDE THE ENCLAVE, AND MATCHED IN THE BATCH WINDOW. LOGS SHOW METADATA ONLY.",
                },
                {
                  step: "05",
                  title: "SETTLEMENT",
                  desc: "FUNDS ARRIVE AT THE SPECIFIED RECEIVER ADDRESS — NOT THE SUBMITTER'S WALLET. ON-CHAIN EVENT: ONLY COMMITMENT HASHES, NO RECEIVER INFO.",
                },
                {
                  step: "06",
                  title: "FLASH LOAN FILL",
                  desc: "SUBMIT AN UNMATCHED ORDER. WATCH THE FLASH LOAN AUTO-SETTLE VIA DEEPBOOK. BORROW, SWAP, REPAY, TRANSFER — ONE PTB, ONE TRANSACTION.",
                },
              ].map((item, i) => (
                <FadeIn key={item.step} isVisible={isVisible} delay={300 + i * 100}>
                  <div className="flex gap-5 items-start">
                    <div className="text-[32px] tracking-widest font-display opacity-20 shrink-0">
                      {item.step}
                    </div>
                    <div className="border-l border-border pl-5 space-y-2 pt-1">
                      <h3 className="text-[16px] tracking-widest">{item.title}</h3>
                      <p className="text-[14px] tracking-wide text-muted-foreground leading-relaxed">
                        <EDesc text={item.desc} />
                      </p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 11: TECH STACK
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="stack" onInView={() => setActiveSlide(10)}>
        {(isVisible) => (
          <div className="space-y-14">
            <div className="text-center space-y-5">
              <FadeIn isVisible={isVisible} delay={0}>
                <div className="text-[15px] tracking-[0.3em] text-muted-foreground">
                  <ELabel text="TECHNOLOGY" />
                </div>
              </FadeIn>

              <FadeIn isVisible={isVisible} delay={150}>
                <h2 className="text-[36px] md:text-[56px] tracking-widest font-display">
                  TECH STACK
                </h2>
              </FadeIn>
            </div>

            <FadeIn isVisible={isVisible} delay={300}>
              <div className="border border-border divide-y divide-border">
                {[
                  {
                    layer: "SMART CONTRACTS",
                    tech: "SUI MOVE",
                    detail:
                      "GROTH16 VERIFICATION · SEAL INTEGRATION · GENERIC COIN TYPES",
                  },
                  {
                    layer: "ZK PROOFS",
                    tech: "CIRCOM + SNARKJS",
                    detail:
                      "GROTH16 CIRCUIT · BROWSER-SIDE WASM PROVING · POSEIDON HASHES",
                  },
                  {
                    layer: "ENCRYPTION",
                    tech: "SUI SEAL",
                    detail:
                      "THRESHOLD ENCRYPTION · 2-OF-3 KEY SERVERS · ALLOWLIST ACCESS",
                  },
                  {
                    layer: "MATCHING ENGINE",
                    tech: "NODE.JS + EXPRESS",
                    detail:
                      "TYPESCRIPT · @MYSTEN/SUI SDK · IN-MEMORY ORDER BOOK",
                  },
                  {
                    layer: "TEE FRAMEWORK",
                    tech: "NAUTILUS",
                    detail:
                      "SECP256K1 ATTESTATION · LOCAL-DEV MODE · PRODUCTION-READY",
                  },
                  {
                    layer: "FLASH LOANS",
                    tech: "DEEPBOOK V3",
                    detail:
                      "HOT POTATO PTBS · ATOMIC BORROW-SWAP-REPAY · REFERENCE PRICING",
                  },
                  {
                    layer: "FRONTEND",
                    tech: "NEXT.JS 15",
                    detail:
                      "REACT 19 · APP ROUTER · TAILWIND CSS · ZUSTAND STATE",
                  },
                  {
                    layer: "WALLET",
                    tech: "@MYSTEN/DAPP-KIT",
                    detail:
                      "SUI WALLET CONNECTION · TRANSACTION SIGNING · BALANCE QUERIES",
                  },
                ].map((row) => (
                  <div
                    key={row.layer}
                    className="grid grid-cols-3 gap-6 p-5 items-center"
                  >
                    <div className="text-[14px] tracking-widest text-muted-foreground">
                      <ESub text={row.layer} />
                    </div>
                    <div className="text-[15px] tracking-widest font-mono">
                      <ESub text={row.tech} />
                    </div>
                    <div className="text-[13px] tracking-wide text-muted-foreground">
                      <EDesc text={row.detail} />
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        )}
      </Slide>

      {/* ════════════════════════════════════════════════════════════════════
          SLIDE 12: CLOSING
      ════════════════════════════════════════════════════════════════════ */}
      <Slide id="closing" inverted onInView={() => setActiveSlide(11)}>
        {(isVisible) => (
          <div className="text-center space-y-12">
            <FadeIn isVisible={isVisible} delay={0}>
              <div className="text-[15px] tracking-[0.3em] opacity-50">
                <ELabel text="ETHGLOBAL HACKMONEY 2026 · SOLO BUILD" />
              </div>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={200}>
              <h2 className="text-[80px] md:text-[130px] tracking-[0.2em] font-display leading-none">
                ZEBRA
              </h2>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={400}>
              <div className="w-20 h-px bg-current mx-auto" />
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={600}>
              <p className="text-[22px] md:text-[28px] tracking-[0.15em]">
                <ESub text="PRIVACY-FIRST TRADING INFRASTRUCTURE FOR SUI" />
              </p>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={800}>
              <p className="text-[15px] tracking-wide opacity-50 max-w-xl mx-auto leading-relaxed">
                <EDesc text="ON-CHAIN, AN OBSERVER SEES A COMMITMENT HASH GO IN AND FUNDS ARRIVE AT UNRELATED ADDRESSES. THERE IS NO VISIBLE CONNECTION BETWEEN THE TRADER, THE ORDER, AND THE SETTLEMENT." />
              </p>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={1000}>
              <div className="flex items-center justify-center gap-4 pt-4">
                <Link href="/trade">
                  <Button
                    size="lg"
                    className="bg-transparent text-current border-current hover:opacity-70"
                  >
                    TRY ZEBRA
                  </Button>
                </Link>
              </div>
            </FadeIn>

            <FadeIn isVisible={isVisible} delay={1200}>
              <div className="pt-8 space-y-2">
                <div className="flex items-center justify-center gap-8 text-[14px] tracking-widest opacity-40">
                  <span><ELabel text="SUI" /></span>
                  <span>·</span>
                  <span><ELabel text="DEEPBOOK" /></span>
                  <span>·</span>
                  <span><ELabel text="NAUTILUS" /></span>
                  <span>·</span>
                  <span><ELabel text="SEAL" /></span>
                </div>
              </div>
            </FadeIn>
          </div>
        )}
      </Slide>
    </div>
  );
}
