"use client";

import { HomePanel } from "@/components/layout/sidebar/panels/HomePanel";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-64 h-full border-r border-border bg-background shrink-0 overflow-hidden hidden lg:block">
        <HomePanel />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
