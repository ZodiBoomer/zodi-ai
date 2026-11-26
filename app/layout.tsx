import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./responsive-overrides.css";

export const metadata: Metadata = {
  title: "ZODIX",
  description: "Le noyau de ton assistant personnel."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
