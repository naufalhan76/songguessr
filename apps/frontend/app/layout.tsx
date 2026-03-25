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
  title: "muze.games",
  description: "A monochrome multiplayer music guessing game built for fast, social play.",
  keywords: ["music", "game", "spotify", "multiplayer", "guess", "songs"],
  authors: [{ name: "muze.games Team" }],
  openGraph: {
    type: "website",
    title: "muze.games",
    description: "Guess songs from your friends' Spotify playlists in real-time",
    siteName: "muze.games",
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
          <footer className="border-t border-white/10 px-4 py-6 text-center text-sm text-white/45 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span>2026 Created with love by</span>
              <a
                href="https://instagram.com/nufnh"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-white/80 transition hover:text-emerald-300"
              >
                @nufnh
              </a>
              <span>and supported by</span>
              <a
                href="https://instagram.com/zwaalffaa"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-white/80 transition hover:text-emerald-300"
              >
                @zwaalffaa
              </a>
            </div>
          </footer>
        </main>
      </body>
    </html>
  );
}

