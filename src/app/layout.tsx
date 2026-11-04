import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NewsAI Studio — Turn news into short-form video",
  description:
    "Transform sports and news articles into engaging AI presenter news videos. Professional editorial video synthesis engine.",
  keywords: ["AI News", "Short-form video", "NewsAI Studio", "AI Presenter", "Sports News"],
};

export const viewport: Viewport = {
  themeColor: "#090A0F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="h-full bg-[#090A0F] text-zinc-100 flex flex-col font-sans overflow-hidden">
        {children}
      </body>
    </html>
  );
}
