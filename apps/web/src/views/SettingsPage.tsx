"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { ShieldOff, Lock, KeyRound, FlaskConical, Brain } from "lucide-react";
import {
  SET_SYSTEM_SHUTDOWN,
  SYSTEM_SETTINGS_QUERY,
  CHANGE_PASSWORD,
} from "../lib/graphql/mutations/system";
import {
  AGENT_GOVERNANCE_QUERY,
  FEATURE_FLAGS_QUERY,
  COMPANY_MEMORY_DEFAULT_QUERY,
} from "@/lib/graphql/queries";
import {
  SET_AGENT_GOVERNANCE,
  UPDATE_FEATURE_FLAG,
  SET_COMPANY_MEMORY_PROVIDER,
} from "@/lib/graphql/mutations";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { MEMORY_PROVIDERS, FLAG_KEYS } from "@agentcenter/utils";
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
import { LicenseStatusCode } from "@/server/constants";
import { API_ROUTES } from "@/lib/api-routes";
import { SidebarCustomizeCard } from "@/components/layout/sidebar/SidebarCustomizeCard";
import { NotificationPreferencesCard } from "@/components/settings/NotificationPreferencesCard";

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
    fetch(API_ROUTES.license.get)
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

      {/* Agent Governance */}
      <AgentGovernanceCard />

      {/* Agent memory backend */}
      <MemoryDefaultCard />

      {/* Notification preferences */}
      <NotificationPreferencesCard />

      {/* Sidebar customization */}
      <SidebarCustomizeCard />

      {/* Experimental feature flags */}
      <FeatureFlagsCard />

      {/* License */}
      {licenseInfo && licenseInfo.status !== LicenseStatusCode.NONE && (
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
                licenseInfo.status === LicenseStatusCode.ACTIVE
                  ? "bg-success-muted text-success"
                  : licenseInfo.status === LicenseStatusCode.GRACE
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

/**
 * Epic A.4: workspace agent governance. The one enforceable knob — requireAgentApproval — makes
 * newly provisioned agents (team install / import) start pending_setup so they can't be assigned
 * work until an admin activates them.
 */
function AgentGovernanceCard() {
  const [{ data }, refetch] = useQuery({ query: AGENT_GOVERNANCE_QUERY });
  const [, setGovernance] = useMutation(SET_AGENT_GOVERNANCE);
  const requireApproval: boolean = data?.agentGovernance?.requireAgentApproval ?? false;
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      const res = await setGovernance({ requireAgentApproval: next });
      if (res.error) {
        toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to update governance");
      } else {
        toast.success(next ? "New agents now require approval" : "Agent approval requirement off");
        refetch({ requestPolicy: "network-only" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
          <ShieldOff className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">Agent Governance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Require admin approval for new agents. When on, agents added by installing a team or
            importing a workspace start deactivated and cannot be assigned work until an admin
            activates them.
          </p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={requireApproval}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
        />
        Require approval before new agents can work
      </label>
    </Card>
  );
}

/**
 * Domain 4: the workspace-default memory backend for agents (none / markdown / db). Individual agents
 * can override it; this sets the default they inherit. MEMORY-gated — self-hides when the flag is off.
 */
function MemoryDefaultCard() {
  const enabled = useFeatureFlag(FLAG_KEYS.MEMORY);
  const [{ data }, refetch] = useQuery<{ companyMemoryDefault: string | null }>({
    query: COMPANY_MEMORY_DEFAULT_QUERY,
    pause: !enabled,
  });
  const [, setProvider] = useMutation(SET_COMPANY_MEMORY_PROVIDER);
  const [saving, setSaving] = useState(false);

  if (!enabled) return null;
  const current = data?.companyMemoryDefault ?? "none";

  async function onChange(provider: string) {
    setSaving(true);
    try {
      const res = await setProvider({ provider });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to update");
      else {
        toast.success(`Memory backend set to ${provider}`);
        refetch({ requestPolicy: "network-only" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <Brain className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Agent memory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The default memory backend new agents use. Individual agents can override it.
          </p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        Default backend
        <select
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
          value={current}
          disabled={saving}
          onChange={(e) => onChange(e.target.value)}
        >
          {MEMORY_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </Card>
  );
}

interface FeatureFlag {
  key: string;
  enabled: boolean;
  managedBy: string;
  description?: string | null;
}

/**
 * Experimental feature flags — a per-flag toggle grid so an admin can turn optional features on/off
 * without a DB round-trip. Only user-managed flags are toggleable; system-managed ones are shown but
 * locked (the server rejects toggling them). Mirrors Paperclip's InstanceExperimentalSettings.
 */
function FeatureFlagsCard() {
  const [{ data, fetching }, refetch] = useQuery<{ featureFlags: FeatureFlag[] }>({
    query: FEATURE_FLAGS_QUERY,
  });
  const [, updateFlag] = useMutation(UPDATE_FEATURE_FLAG);
  const [busy, setBusy] = useState<string | null>(null);

  const flags = [...(data?.featureFlags ?? [])].sort((a, b) => a.key.localeCompare(b.key));

  async function toggle(key: string, next: boolean) {
    setBusy(key);
    try {
      const res = await updateFlag({ key, enabled: next });
      if (res.error) {
        toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to update flag");
      } else {
        toast.success(`${key} ${next ? "enabled" : "disabled"}`);
        refetch({ requestPolicy: "network-only" });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Experimental Features</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn optional features on or off for this workspace. System-managed flags are shown but
            can only be changed by your administrator.
          </p>
        </div>
      </div>

      {fetching && flags.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading flags…</p>
      )}

      <ul className="divide-y divide-border">
        {flags.map((f) => {
          const locked = f.managedBy !== "user";
          return (
            <li key={f.key} className="flex items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-mono text-sm text-foreground">
                  {f.key}
                  {locked && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      system
                    </span>
                  )}
                </p>
                {f.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
                )}
              </div>
              <label className="inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={f.enabled}
                  disabled={locked || busy === f.key}
                  onChange={(e) => toggle(f.key, e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
