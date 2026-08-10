"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { Info, ScrollText, Trash2, Pencil } from "lucide-react";
import { APPROVAL_POLICIES_QUERY } from "@/lib/graphql/queries";
import { SET_APPROVAL_POLICY, DELETE_APPROVAL_POLICY } from "@/lib/graphql/mutations";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { APPROVAL_ACTIONS, APPROVAL_EFFECTS, FLAG_KEYS } from "@agentcenter/utils";
import {
  Button,
  Card,
  Badge,
  Checkbox,
  ConfirmDialog,
  FormDialog,
  Select,
  Tooltip,
} from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";

interface Policy {
  id: string;
  name: string;
  priority: number;
  action: string;
  effect: string;
  enabled: boolean;
  subject: unknown;
  condition: unknown;
}

const EFFECT_BADGE: Record<string, "green" | "yellow" | "red" | "gray"> = {
  allow: "green",
  require_approval: "yellow",
  deny: "red",
};

const EMPTY = {
  id: null as string | null,
  name: "",
  action: "run",
  effect: "require_approval",
  priority: 0,
  subjectText: "",
  conditionText: "",
  enabled: true,
};

function parseJsonOrThrow(label: string, text: string): object | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

/**
 * Rule-based approval policies (governance depth). A priority-ordered list of rules the approval engine
 * consults — first match wins, default allow. GOVERNANCE-gated (self-hides when the flag is off).
 */
export function ApprovalPoliciesCard() {
  const enabled = useFeatureFlag(FLAG_KEYS.GOVERNANCE);
  const [{ data, fetching }, refetch] = useQuery<{ approvalPolicies: Policy[] }>({
    query: APPROVAL_POLICIES_QUERY,
    pause: !enabled,
  });
  const [, save] = useMutation(SET_APPROVAL_POLICY);
  const [, remove] = useMutation(DELETE_APPROVAL_POLICY);

  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Policy | null>(null);

  if (!enabled) return null;
  const policies = data?.approvalPolicies ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  function openCreate() {
    setFormError(null);
    setForm({ ...EMPTY });
  }
  function openEdit(p: Policy) {
    setFormError(null);
    setForm({
      id: p.id,
      name: p.name,
      action: p.action,
      effect: p.effect,
      priority: p.priority,
      subjectText: p.subject ? JSON.stringify(p.subject, null, 2) : "",
      conditionText: p.condition ? JSON.stringify(p.condition, null, 2) : "",
      enabled: p.enabled,
    });
  }

  async function submit() {
    if (!form || !form.name.trim() || busy) return;
    let subject: object | null;
    let condition: object | null;
    try {
      subject = parseJsonOrThrow("Subject", form.subjectText);
      condition = parseJsonOrThrow("Condition", form.conditionText);
    } catch (e) {
      setFormError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      const res = await save({
        id: form.id,
        name: form.name.trim(),
        action: form.action,
        effect: form.effect,
        priority: Number(form.priority) || 0,
        subject,
        condition,
        enabled: form.enabled,
      });
      if (res.error) {
        setFormError(res.error.graphQLErrors[0]?.message ?? "Failed to save policy");
        return;
      }
      toast.success(form.id ? "Policy updated" : "Policy created");
      setForm(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      const res = await remove({ id: toDelete.id });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to delete");
      else {
        toast.success(`Policy "${toDelete.name}" deleted`);
        refresh();
      }
    } finally {
      setBusy(false);
      setToDelete(null);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <ScrollText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Approval policies</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Priority-ordered rules the approval engine consults before a gated agent action. The
            highest-priority matching rule wins; if none match, the default is allow (and the coarse
            &ldquo;require approval&rdquo; setting above still applies).
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          New policy
        </Button>
      </div>

      {fetching && policies.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading policies…</p>
      )}
      {!fetching && policies.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No policies yet. Without any, agent approvals fall back to the coarse setting above.
        </p>
      )}

      {policies.length > 0 && (
        <ul className="divide-y divide-border">
          {policies.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  {p.name}
                  <Badge variant="gray" size="sm">
                    #{p.priority}
                  </Badge>
                  <Badge variant="blue" size="sm">
                    {p.action}
                  </Badge>
                  <Badge variant={EFFECT_BADGE[p.effect] ?? "gray"} size="sm">
                    {p.effect}
                  </Badge>
                  {!p.enabled && (
                    <Badge variant="gray" size="sm">
                      disabled
                    </Badge>
                  )}
                </p>
                {Boolean(p.subject || p.condition) && (
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {p.subject ? `subject ${JSON.stringify(p.subject)}` : ""}
                    {p.subject && p.condition ? " · " : ""}
                    {p.condition ? `if ${JSON.stringify(p.condition)}` : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => openEdit(p)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Edit ${p.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setToDelete(p)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create / edit form */}
      <FormDialog
        open={Boolean(form)}
        onOpenChange={(o) => !o && setForm(null)}
        title={form?.id ? "Edit approval policy" : "New approval policy"}
        onSubmit={submit}
        submitLabel={form?.id ? "Save policy" : "Create policy"}
        busy={busy}
        submitDisabled={!form?.name.trim()}
        error={formError}
      >
        {form && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">Name</span>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Require approval for high spend"
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                  Action
                  <Tooltip content="What the agent is trying to do — the action being gated. '*' matches any action.">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </Tooltip>
                </span>
                <Select
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value })}
                >
                  <option value="*">* (any)</option>
                  {APPROVAL_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                  Effect
                  <Tooltip content="What happens on a match: allow (proceed), require_approval (create a pending approval), or deny (refuse with a reason).">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </Tooltip>
                </span>
                <Select
                  value={form.effect}
                  onChange={(e) => setForm({ ...form, effect: e.target.value })}
                >
                  {APPROVAL_EFFECTS.map((eff) => (
                    <option key={eff} value={eff}>
                      {eff}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                  Priority
                  <Tooltip content="Higher wins when multiple policies match. Ties are broken deterministically.">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </Tooltip>
                </span>
                <Input
                  type="number"
                  value={String(form.priority)}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                Subject (JSON, optional)
                <Tooltip content='Which agents this applies to. Empty = all. e.g. {"trustLevels":["untrusted"]} or {"agentIds":["…"]} or {"roles":["engineer"]}.'>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </Tooltip>
              </span>
              <textarea
                className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
                rows={2}
                value={form.subjectText}
                onChange={(e) => setForm({ ...form, subjectText: e.target.value })}
                placeholder='{"trustLevels":["untrusted"]}'
              />
            </label>

            <label className="block space-y-1">
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                Condition (JSON, optional)
                <Tooltip content='A predicate over the action context. e.g. {"costCentsOver":5000} or {"trustBelow":"trusted"}. Empty = always.'>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </Tooltip>
              </span>
              <textarea
                className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
                rows={2}
                value={form.conditionText}
                onChange={(e) => setForm({ ...form, conditionText: e.target.value })}
                placeholder='{"costCentsOver":5000}'
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              Enabled
            </label>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={`Delete "${toDelete?.name}"?`}
        description={
          `This removes the "${toDelete?.effect}" rule for "${toDelete?.action}". Gated actions it ` +
          "matched will fall through to lower-priority policies or the coarse default. This cannot be undone."
        }
        confirmLabel="Yes, delete"
        variant="danger"
        loading={busy}
      />
    </Card>
  );
}
