import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Atomic Credit Society MVP",
  description: "Autonomous agent lending and credit MVP"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="ambient-bg" aria-hidden="true" />
        <div className="ambient-grid" aria-hidden="true" />
        <NavBar />
        <main className="w-full px-4 pb-12 pt-6 sm:px-6 lg:px-8">{children}</main>
      </body>
    </html>
  );
}
