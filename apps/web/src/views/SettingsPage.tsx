"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { ShieldOff, Lock, KeyRound } from "lucide-react";
import {
  SET_SYSTEM_SHUTDOWN,
  SYSTEM_SETTINGS_QUERY,
  CHANGE_PASSWORD,
} from "../lib/graphql/mutations/system";
import { Breadcrumbs, Card, Button, ConfirmDialog, PageLayout } from "../components/ui";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/shadcn/form";
import { Input } from "@/components/ui/shadcn/input";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export function SettingsPage() {
  const [systemSettingsResult] = useQuery({ query: SYSTEM_SETTINGS_QUERY });
  const [, executeSetShutdown] = useMutation(SET_SYSTEM_SHUTDOWN);
  const [, executeChangePassword] = useMutation(CHANGE_PASSWORD);
  const shutdownActive = systemSettingsResult.data?.systemSettings?.shutdownActive ?? false;

  const [showConfirm, setShowConfirm] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<{
    status: string;
    plan: string | null;
    org: string | null;
    expiresAt: string | null;
    features: string[];
    maxAgents: number;
    maxProjects: number;
    maxSeats: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/license")
      .then((r) => r.json())
      .then(setLicenseInfo)
      .catch(() => {});
  }, []);

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const handleToggleShutdown = async () => {
    setIsToggling(true);
    try {
      const result = await executeSetShutdown({ active: !shutdownActive });
      if (result.error) throw result.error;
      toast.success(
        shutdownActive
          ? "System shutdown deactivated. Operations resumed."
          : "System shutdown activated. All operations paused.",
      );
    } catch {
      toast.error("Failed to toggle system shutdown");
    } finally {
      setIsToggling(false);
      setShowConfirm(false);
    }
  };

  const onSubmitPassword = async (values: ChangePasswordValues) => {
    try {
      const result = await executeChangePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (result.error) {
        const msg = result.error.graphQLErrors[0]?.message || result.error.message;
        toast.error(msg);
        return;
      }
      toast.success("Password changed. You will be redirected to login.");
      form.reset();
      // Session was revoked — redirect to login after a short delay
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch {
      toast.error("Failed to change password");
    }
  };

  return (
    <PageLayout maxWidth="narrow">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Settings" }]} />
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System-wide configuration</p>
      </div>

      {/* Change Password */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">Change Password</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Update your password. All existing sessions will be revoked.
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitPassword)} className="space-y-3">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Min. 8 characters" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
              {form.formState.isSubmitting ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </Form>
      </Card>

      {/* License */}
      {licenseInfo && licenseInfo.status !== "none" && (
        <Card padding="lg" className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
              <KeyRound className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">License</h2>
              <p className="text-sm text-muted-foreground mt-1">Your current license details</p>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                licenseInfo.status === "active"
                  ? "bg-success-muted text-success"
                  : licenseInfo.status === "grace"
                    ? "bg-warning-muted text-warning"
                    : "bg-destructive/10 text-destructive"
              }`}
            >
              {licenseInfo.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {licenseInfo.org && (
              <div>
                <span className="text-muted-foreground">Organization</span>
                <p className="font-medium text-foreground">{licenseInfo.org}</p>
              </div>
            )}
            {licenseInfo.plan && (
              <div>
                <span className="text-muted-foreground">Plan</span>
                <p className="font-medium text-foreground capitalize">{licenseInfo.plan}</p>
              </div>
            )}
            {licenseInfo.expiresAt && (
              <div>
                <span className="text-muted-foreground">Expires</span>
                <p className="font-medium text-foreground">
                  {new Date(licenseInfo.expiresAt).toLocaleDateString()}
                </p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Limits</span>
              <p className="font-medium text-foreground">
                {licenseInfo.maxAgents === -1 ? "Unlimited" : licenseInfo.maxAgents} agents
                {" / "}
                {licenseInfo.maxProjects === -1 ? "Unlimited" : licenseInfo.maxProjects} projects
                {" / "}
                {licenseInfo.maxSeats === -1 ? "Unlimited" : licenseInfo.maxSeats} seats
              </p>
            </div>
          </div>

          {licenseInfo.features.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground">Licensed features</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {licenseInfo.features.map((f) => (
                  <span
                    key={f}
                    className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* System Shutdown */}
      <div
        className={`rounded-xl border p-6 space-y-4 ${
          shutdownActive
            ? "border-destructive/30 bg-destructive-muted"
            : "border-border bg-background"
        }`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
              shutdownActive ? "bg-destructive/15" : "bg-muted"
            }`}
          >
            <ShieldOff
              className={`w-5 h-5 ${shutdownActive ? "text-destructive" : "text-muted-foreground"}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">System Shutdown</h2>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Blocks all new task creation (dashboard & API)</li>
              <li>Prevents agents from picking up new work</li>
              <li>Stops recurring tasks from generating</li>
              <li>Does not affect tasks already in progress</li>
            </ul>
            {shutdownActive && (
              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-destructive">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                System is currently shut down
              </div>
            )}
          </div>
        </div>

        <Button
          onClick={() => setShowConfirm(true)}
          variant={shutdownActive ? "primary" : "danger"}
          className="w-full"
        >
          {shutdownActive ? "Resume Operations" : "Activate Shutdown"}
        </Button>
        <ConfirmDialog
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleToggleShutdown}
          title={shutdownActive ? "Resume operations?" : "Activate system shutdown?"}
          description={
            shutdownActive
              ? "Agents will be able to receive tasks again."
              : "This will immediately block all task creation and agent assignments across the entire system."
          }
          confirmLabel={shutdownActive ? "Yes, resume operations" : "Yes, shut down"}
          variant={shutdownActive ? "primary" : "danger"}
          loading={isToggling}
        />
      </div>
    </PageLayout>
  );
}
