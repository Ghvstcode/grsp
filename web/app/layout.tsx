import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    title: "sustn — Stop prompting. Start approving.",
    description:
        "Background conductor for AI coding agents. Continuously improve your codebase using leftover AI subscription budget. All changes land as branches and PRs — zero risk.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html
            lang="en"
            className={`${inter.variable} ${jetbrainsMono.variable}`}
        >
            <body className="font-sans antialiased">
                {children}
                <Analytics />
            </body>
        </html>
    );
}
