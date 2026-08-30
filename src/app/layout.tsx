import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UDP CRM",
  description: "CRM UDP — PT. Unicam Digital Pictvres untuk Unimasi, Segia Tech, Erfo Multimedia, dan Unicam Studio — semua kanal pesan dalam satu inbox.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
