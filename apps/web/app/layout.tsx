import type { Metadata } from "next";
import "./globals.css";
import { RuntimeEnvScript } from "@/components/RuntimeEnvScript";

export const metadata: Metadata = {
  title: "AgentCenter",
  description: "Mission Control for Your AI Agents",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RuntimeEnvScript />
        {children}
      </body>
    </html>
  );
}
