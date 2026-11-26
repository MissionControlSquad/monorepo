import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "@/providers";
import { adminUserModel } from "@/server/models";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  // Setup gate: if no admin exists, force initial setup
  const adminCount = await adminUserModel.count();
  if (adminCount === 0) {
    redirect("/setup");
  }

  return (
    <Providers>
      <AppShell modal={modal}>{children}</AppShell>
    </Providers>
  );
}
