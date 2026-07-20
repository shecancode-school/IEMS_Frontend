import type { Metadata } from "next";
import {
  Permanent_Marker,
  Barlow_Condensed,
  Instrument_Sans,
} from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { cn } from "@/lib/utils";

/* Decorative fonts (display headings + condensed labels): don't preload them.
   They cover only some text, so preloading every weight trips the browser's
   "preloaded resource not used within a few seconds" warning — especially over
   a slow tunnel. font-display: swap fills in the moment they load. */
const marker = Permanent_Marker({
  variable: "--font-marker",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  preload: false,
});

/* the body typeface is used everywhere on first paint — keep it preloaded */
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Events Calendar Igire Rwanda Organization",
  description:
    "What's on at Igire Rwanda Organization shows, workshops, exhibitions and community events in Kigali.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      /* browser extensions stamp attributes onto <html> before React
         hydrates (e.g. __gcrremoteframetoken) — not ours, don't warn */
      suppressHydrationWarning
      className={cn("h-full antialiased font-sans", marker.variable, barlow.variable, instrument.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
