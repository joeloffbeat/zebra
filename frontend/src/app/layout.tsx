import type { Metadata } from "next";
import { Inter, Space_Mono, Bebas_Neue } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  weight: ["400"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZEBRA",
  description: "ZK DARK POOL FOR HIDDEN LIMIT ORDERS ON SUI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          inter.variable,
          spaceMono.variable,
          bebasNeue.variable,
          "min-h-screen bg-background text-foreground antialiased"
        )}
      >
        {children}
      </body>
    </html>
  );
}

