"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { AGENT_TRUST_PROFILE_QUERY } from "@/lib/graphql/queries";
import { SET_AGENT_TRUST_PROFILE } from "@/lib/graphql/mutations";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { Card, Button, Badge } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";
import { Switch } from "@/components/ui/shadcn/switch";

// Epic #3 — per-agent trust-profile editor (agent-domain governance; NOT human RBAC). Wires the
// previously-unreachable setAgentTrustProfile mutation. GOVERNANCE-gated (self-hides when off);
// mutations are admin-enforced server-side (a non-admin save surfaces the error as a toast).

const TRUST_LEVELS = ["untrusted", "low", "standard", "trusted"] as const;
type TrustLevel = (typeof TRUST_LEVELS)[number];

interface TrustProfile {
  agentId: string;
  trustLevel: string;
  lowTrustContainment: boolean;
  requireUntrustedPrReview: boolean;
  autoPromoteWorkProduct: boolean;
  sourceTrustBadge?: string | null;
  changeConsentRequired: boolean;
  executionAllowlist: string[];
  updatedAt: string;
}

type Draft = {
  trustLevel: TrustLevel;
  lowTrustContainment: boolean;
  requireUntrustedPrReview: boolean;
  autoPromoteWorkProduct: boolean;
  changeConsentRequired: boolean;
  sourceTrustBadge: string;
  executionAllowlist: string;
};

function toDraft(p: TrustProfile | null | undefined): Draft {
  return {
    trustLevel: (p?.trustLevel as TrustLevel) ?? "standard",
    lowTrustContainment: p?.lowTrustContainment ?? false,
    requireUntrustedPrReview: p?.requireUntrustedPrReview ?? false,
    autoPromoteWorkProduct: p?.autoPromoteWorkProduct ?? true,
    changeConsentRequired: p?.changeConsentRequired ?? false,
    sourceTrustBadge: p?.sourceTrustBadge ?? "",
    executionAllowlist: (p?.executionAllowlist ?? []).join(", "),
  };
}

const TOGGLES: { key: keyof Draft; label: string; hint: string }[] = [
  {
    key: "lowTrustContainment",
    label: "Low-trust containment",
    hint: "Force isolation for low/untrusted runs",
  },
  {
    key: "requireUntrustedPrReview",
    label: "Require review for untrusted PRs",
    hint: "Human review before merging untrusted work",
  },
  {
    key: "autoPromoteWorkProduct",
    label: "Auto-promote work products",
    hint: "Promote deliverables without manual gating",
  },
  {
    key: "changeConsentRequired",
    label: "Change-consent required",
    hint: "Ask before applying agent-proposed changes",
  },
];

export function AgentTrustCard({ agentId }: { agentId: string }) {
  const governanceOn = useFeatureFlag(FLAG_KEYS.GOVERNANCE);

  const [{ data, fetching }] = useQuery<{ agentTrustProfile: TrustProfile | null }>({
    query: AGENT_TRUST_PROFILE_QUERY,
    variables: { agentId },
    pause: !governanceOn || !agentId,
  });
  const [{ fetching: saving }, save] = useMutation(SET_AGENT_TRUST_PROFILE);

  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  // Sync the draft when the server value arrives / changes.
  useEffect(() => {
    if (data?.agentTrustProfile !== undefined) setDraft(toDraft(data?.agentTrustProfile));
  }, [data?.agentTrustProfile]);

  if (!governanceOn) return null;

  async function onSave() {
    const res = await save({
      agentId,
      trustLevel: draft.trustLevel,
      lowTrustContainment: draft.lowTrustContainment,
      requireUntrustedPrReview: draft.requireUntrustedPrReview,
      autoPromoteWorkProduct: draft.autoPromoteWorkProduct,
      changeConsentRequired: draft.changeConsentRequired,
      sourceTrustBadge: draft.sourceTrustBadge.trim() || null,
      executionAllowlist: draft.executionAllowlist
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    if (res.error) {
      toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to update trust profile");
    } else {
      toast.success("Trust profile updated");
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Trust profile</h2>
            <Badge>{draft.trustLevel}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Per-agent trust &amp; containment (agent-domain governance).
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-foreground">Trust level</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={draft.trustLevel}
            onChange={(e) => setDraft((d) => ({ ...d, trustLevel: e.target.value as TrustLevel }))}
            disabled={fetching}
          >
            {TRUST_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </label>

        {TOGGLES.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{label}</div>
              <div className="text-xs text-muted-foreground">{hint}</div>
            </div>
            <Switch
              checked={draft[key] as boolean}
              onCheckedChange={(v: boolean) => setDraft((d) => ({ ...d, [key]: v }))}
              disabled={fetching}
            />
          </div>
        ))}

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Source trust badge</span>
          <Input
            value={draft.sourceTrustBadge}
            placeholder="e.g. verified-vendor"
            onChange={(e) => setDraft((d) => ({ ...d, sourceTrustBadge: e.target.value }))}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Execution allowlist</span>
          <Input
            value={draft.executionAllowlist}
            placeholder="comma-separated commands, e.g. npm, git, ls"
            onChange={(e) => setDraft((d) => ({ ...d, executionAllowlist: e.target.value }))}
          />
        </label>
      </div>

      <Button onClick={onSave} disabled={saving || fetching}>
        {saving ? "Saving…" : "Save trust profile"}
      </Button>
    </Card>
  );
}
