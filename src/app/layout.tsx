import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Ledger — Work Management",
  description: "A modern work management and document UI system for Chartered Accountants",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
