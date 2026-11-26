import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./responsive-overrides.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ZODIX",
  description: "Le noyau de ton assistant personnel.",
  applicationName: "ZODIX",
  icons: {
    icon: [{ url: "/zodix-logo.jpg", type: "image/jpeg" }],
    apple: [{ url: "/zodix-logo.jpg", type: "image/jpeg" }]
  },
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
