import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NexusPlay — Cross-Device Multiplayer Gaming",
  description:
    "Turn your phone into a game controller. Open the host on your PC, scan the QR code on your phone, and play instantly — no app required.",
  keywords: ["multiplayer", "game controller", "browser game", "AirConsole alternative"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
