import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "../components/providers";
import { CartProvider } from "../features/cart/cart-provider";
import { StoreShell } from "../components/layout/store-shell";
import type { Config } from "../lib/contracts";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "RoboNest | Electronics & Robotics Components",
  description: "Shop electronics and robotics components with RoboNest.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config: Config = {
    auth: process.env.ROBONEST_AUTH_ENABLED !== "false",
    capabilities: (process.env.ROBONEST_VERIFIED_CAPABILITIES || "")
      .split(",")
      .filter(Boolean),
  };

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers config={config}>
          <CartProvider>
            <StoreShell>{children}</StoreShell>
          </CartProvider>
        </Providers>
      </body>
    </html>
  );
}
