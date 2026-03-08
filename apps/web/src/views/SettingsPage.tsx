"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { ShieldOff, Lock, ToggleRight } from "lucide-react";
import {
  SET_SYSTEM_SHUTDOWN,
  SYSTEM_SETTINGS_QUERY,
  CHANGE_PASSWORD,
} from "../lib/graphql/mutations/system";
import { UPDATE_FEATURE_FLAG } from "../lib/graphql/mutations/feature-flags";
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
import { Switch } from "@/components/ui/shadcn/switch";
import { useFeatureFlags } from "../components/context/FeatureFlagContext";

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
  const [, executeUpdateFlag] = useMutation(UPDATE_FEATURE_FLAG);
  const shutdownActive = systemSettingsResult.data?.systemSettings?.shutdownActive ?? false;
  const { flags } = useFeatureFlags();
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

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

      {/* Feature Flags */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
            <ToggleRight className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">Feature Flags</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Toggle features on or off. System-managed flags can only be changed by infrastructure.
            </p>
          </div>
        </div>

        <div className="divide-y divide-border">
          {flags.map((flag) => {
            const isUserManaged = flag.managedBy === "user";
            const isToggling = togglingFlag === flag.key;
            return (
              <div
                key={flag.key}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{flag.key}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isUserManaged
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {flag.managedBy}
                    </span>
                  </div>
                  {flag.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                  )}
                </div>
                <Switch
                  checked={flag.enabled}
                  disabled={!isUserManaged || isToggling}
                  onCheckedChange={async (checked) => {
                    setTogglingFlag(flag.key);
                    try {
                      const result = await executeUpdateFlag({ key: flag.key, enabled: checked });
                      if (result.error) throw result.error;
                      toast.success(`${flag.key} ${checked ? "enabled" : "disabled"}`);
                    } catch {
                      toast.error(`Failed to update ${flag.key}`);
                    } finally {
                      setTogglingFlag(null);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </Card>

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
