import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const geist = Geist({
    subsets: ["latin"],
    variable: "--font-sans",
});

const geistMono = Geist_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

const title = "grsp — Review code without reading diffs.";
const description =
    "A macOS app for understanding pull requests. See what a PR actually does, step through the changed behaviour, and review with confidence — on the Claude Code or Codex subscription you already have.";

export const metadata: Metadata = {
    metadataBase: new URL("https://grsp.app"),
    title,
    description,
    openGraph: {
        title,
        description,
        url: "https://grsp.app",
        siteName: "grsp",
        type: "website",
    },
    twitter: {
        card: "summary",
        title,
        description,
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
            <body className="font-sans antialiased">
                {children}
                <Analytics />
            </body>
        </html>
    );
}
