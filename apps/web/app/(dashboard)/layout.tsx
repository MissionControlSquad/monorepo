import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "@/providers";

export default function DashboardLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <Providers>
      <AppShell modal={modal}>{children}</AppShell>
    </Providers>
  );
}
