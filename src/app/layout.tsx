import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

// Cormorant Garamond carries the classical register — high contrast, small
// apertures, a true italic. Jost is the counterweight: a geometric sans whose
// letterspaced capitals read like an inscription rather than UI chrome.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://smallfortune.money"),
  title: {
    default: "Small Fortune — your money, translated",
    template: "%s · Small Fortune",
  },
  description:
    "Convert any currency into the real things it buys — a bowl of pho in Hanoi, most of a coffee in Zurich.",
  openGraph: {
    title: "Small Fortune — your money, translated",
    description:
      "Convert any currency into the real things it buys. Every sum is a small fortune somewhere.",
    siteName: "Small Fortune",
    type: "website",
    // Placeholder: this is the square app icon, which link previews will
    // letterbox. Replace with a dedicated 1200x630 when one exists.
    images: [{ url: "/mark.png", width: 128, height: 128 }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2eee4" },
    { media: "(prefers-color-scheme: dark)", color: "#12140e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cormorant.variable} ${jost.variable} h-full`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="relative flex min-h-full flex-col">{children}</body>
    </html>
  );
}
