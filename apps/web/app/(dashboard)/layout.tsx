import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "@/providers";
import { isLicenseActive } from "@/server/license";
import { adminUserModel } from "@/server/models";

export default async function DashboardLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  // Gate 1: Setup — if no admin exists, force initial setup
  const adminCount = await adminUserModel.count();
  if (adminCount === 0) {
    redirect("/setup");
  }

  // Gate 2: License — if not active, force activation
  const licensed = await isLicenseActive();
  if (!licensed) {
    redirect("/activate");
  }

  return (
    <Providers>
      <AppShell modal={modal}>{children}</AppShell>
    </Providers>
  );
}
