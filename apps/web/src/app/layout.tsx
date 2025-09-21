import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "TrendPot",
  description: "Discover TikTok challenges and support creators."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-slate-950 text-slate-100">
      <body className="min-h-screen font-sans antialiased">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16">
          <header>
            <p className="text-sm uppercase tracking-wide text-slate-400">TrendPot</p>
            <h1 className="mt-2 text-3xl font-semibold">Creator growth analytics & giving</h1>
            <p className="mt-2 max-w-2xl text-base text-slate-300">
              Track viral momentum, rally donations, and celebrate community wins with
              a progressive web experience built for short-form storytellers.
            </p>
          </header>
          <main>{children}</main>
          <footer className="border-t border-slate-800 pt-6 text-xs text-slate-500">
            <p>&copy; {new Date().getFullYear()} TrendPot. All rights reserved.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
