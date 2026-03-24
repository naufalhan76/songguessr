import type { Metadata } from "next";
import { IBM_Plex_Mono, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Songguessr",
  description: "A monochrome multiplayer music guessing game built for fast, social play.",
  keywords: ["music", "game", "spotify", "multiplayer", "guess", "songs"],
  authors: [{ name: "Songguessr Team" }],
  openGraph: {
    type: "website",
    title: "Songguessr",
    description: "Guess songs from your friends' Spotify playlists in real-time",
    siteName: "Songguessr",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${ibmPlexMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
        <main className="relative flex min-h-screen flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
