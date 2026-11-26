import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZODIX",
  description: "Le noyau de ton assistant personnel."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
