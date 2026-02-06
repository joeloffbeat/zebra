"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

const TOTAL_FRAMES = 240;

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showButton, setShowButton] = useState(false);

  // Preload all frames
  useEffect(() => {
    let loadedCount = 0;
    const images: HTMLImageElement[] = [];

    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      const frameNum = String(i).padStart(3, "0");
      img.src = `/frames/frame${frameNum}.jpg`;

      img.onload = () => {
        loadedCount++;
        setLoadProgress(Math.round((loadedCount / TOTAL_FRAMES) * 100));

        if (loadedCount === TOTAL_FRAMES) {
          imagesRef.current = images;
          setImagesLoaded(true);
          // Draw first frame
          drawFrame(0);
        }
      };

      images[i - 1] = img;
    }
  }, []);

  const drawFrame = (frameIndex: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imagesRef.current[frameIndex];

    if (!canvas || !ctx || !img) return;

    // Set canvas size to match image
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width;
      canvas.height = img.height;
    }

    ctx.drawImage(img, 0, 0);
  };

  // Handle scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!videoSectionRef.current || !imagesLoaded) return;

      const rect = videoSectionRef.current.getBoundingClientRect();
      const sectionHeight = videoSectionRef.current.offsetHeight;
      const viewportHeight = window.innerHeight;

      const scrolledPast = -rect.top;
      const scrollableDistance = sectionHeight - viewportHeight;
      const progress = Math.min(Math.max(scrolledPast / scrollableDistance, 0), 1);

      // Calculate frame index
      const frameIndex = Math.min(
        Math.floor(progress * (TOTAL_FRAMES - 1)),
        TOTAL_FRAMES - 1
      );

      if (frameIndex !== currentFrame) {
        setCurrentFrame(frameIndex);
        drawFrame(frameIndex);
      }

      setShowButton(progress > 0.85);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [imagesLoaded, currentFrame]);

  return (
    <div className="bg-background">
      {/* VIDEO SECTION */}
      <div ref={videoSectionRef} className="h-[300vh] relative">
        <div className="sticky top-0 h-screen flex flex-col">
          {/* HEADER */}
          <header className="border-b border-border bg-background">
            <div className="container mx-auto px-6 h-16 flex items-center justify-between">
              <span className="text-sm tracking-widest">ZEBRA</span>
              <Link href="/trade">
                <Button>TRADE</Button>
              </Link>
            </div>
          </header>

          {/* CANVAS CONTAINER */}
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
            {/* LOADING STATE */}
            {!imagesLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <span className="text-xs tracking-widest">LOADING</span>
                <div className="w-48 h-px bg-border">
                  <div
                    className="h-full bg-foreground transition-all duration-100"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
                <span className="text-[10px] tracking-widest text-muted-foreground">
                  {loadProgress}%
                </span>
              </div>
            )}

            {/* CANVAS */}
            <canvas
              ref={canvasRef}
              className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${
                imagesLoaded ? "opacity-100" : "opacity-0"
              }`}
            />

            {/* SCROLL INDICATOR */}
            {imagesLoaded && currentFrame < 10 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs tracking-widest text-muted-foreground animate-pulse">
                SCROLL
              </div>
            )}

            {/* CTA BUTTON - CENTER */}
            <div
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${
                showButton ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
              }`}
            >
              <Link href="/trade">
                <Button size="lg">TRY ZEBRA</Button>
              </Link>
            </div>
          </div>

          {/* PROGRESS BAR */}
          <div className="h-px bg-border">
            <div
              className="h-full bg-foreground"
              style={{ width: `${(currentFrame / (TOTAL_FRAMES - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* CONTENT AFTER VIDEO */}
      <section className="min-h-screen border-t border-border">
        <div className="container mx-auto px-6 py-24">
          <div className="max-w-3xl mx-auto space-y-16">
            {/* INTRO */}
            <div className="text-center space-y-4">
              <h2 className="text-lg tracking-widest">HIDE IN THE HERD</h2>
              <p className="text-xs tracking-wide text-muted-foreground leading-relaxed">
                ZEBRA IS A ZK DARK POOL FOR HIDDEN LIMIT ORDERS ON SUI.
                YOUR ORDER DETAILS STAY PRIVATE UNTIL MATCHED.
              </p>
            </div>

            {/* FEATURES */}
            <div className="grid md:grid-cols-3 gap-8">
              <div className="border border-border p-6 space-y-3">
                <div className="text-xs tracking-widest text-muted-foreground">01</div>
                <h3 className="text-sm tracking-widest">HIDDEN ORDERS</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground leading-relaxed">
                  YOUR PRICE AND SIZE ARE ENCRYPTED ON-CHAIN USING ZK PROOFS.
                  NO ONE CAN FRONT-RUN YOUR TRADES.
                </p>
              </div>
              <div className="border border-border p-6 space-y-3">
                <div className="text-xs tracking-widest text-muted-foreground">02</div>
                <h3 className="text-sm tracking-widest">INSTANT MATCHING</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground leading-relaxed">
                  ORDERS ARE MATCHED WHEN PRICE RANGES OVERLAP.
                  EXECUTION AT MIDPOINT FOR FAIR PRICING.
                </p>
              </div>
              <div className="border border-border p-6 space-y-3">
                <div className="text-xs tracking-widest text-muted-foreground">03</div>
                <h3 className="text-sm tracking-widest">DEEPBOOK SETTLEMENT</h3>
                <p className="text-[10px] tracking-wide text-muted-foreground leading-relaxed">
                  ATOMIC SETTLEMENT VIA DEEPBOOK V3.
                  YOUR FUNDS ARE ALWAYS SECURE.
                </p>
              </div>
            </div>

            {/* SPONSORS */}
            <div className="border-t border-border pt-16 space-y-8">
              <div className="text-center">
                <span className="text-xs tracking-widest text-muted-foreground">POWERED BY</span>
              </div>
              <div className="flex items-center justify-center gap-12">
                <span className="text-sm tracking-widest">SUI</span>
                <span className="text-sm tracking-widest">DEEPBOOK</span>
                <span className="text-sm tracking-widest">LI.FI</span>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center pt-8">
              <Link href="/trade">
                <Button size="lg">START TRADING</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <span className="text-xs tracking-widest">ZEBRA</span>
            <span className="text-[10px] tracking-wide text-muted-foreground">
              ZK DARK POOL ON SUI
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

