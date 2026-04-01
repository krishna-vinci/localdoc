import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LocalDocs Hub",
  description: "Local-first markdown document management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
