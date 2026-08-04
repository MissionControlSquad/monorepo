import type { Metadata } from "next";
import "./globals.css";
import "@buildbase/sdk/css";
import { RuntimeEnvScript } from "@/components/RuntimeEnvScript";
import { BuildbaseProvider } from "@/components/providers/BuildbaseProvider";

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

// Applies the saved theme (or the OS preference) to <html> BEFORE first paint, so there's no
// light-to-dark flash on load. Runs from a blocking inline script; kept tiny + dependency-free.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <RuntimeEnvScript />
        <BuildbaseProvider>{children}</BuildbaseProvider>
      </body>
    </html>
  );
}
