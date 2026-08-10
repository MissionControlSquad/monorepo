"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { USER_SECRET_COVERAGE_QUERY, USER_SECRET_DEFINITIONS_QUERY } from "@/lib/graphql/queries";
import {
  DECLARE_USER_SECRET,
  CREATE_USER_SECRET_DEFINITION,
  DELETE_USER_SECRET_DEFINITION,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge, EmptyState, Spinner, Tooltip } from "@/components/ui";
import { WhenAdmin } from "@/components/auth/WhenAdmin";
import { KeyRound, ShieldCheck, ShieldAlert, Info, Plus, Trash2 } from "lucide-react";

// Parity §3 #7: "My secrets" — the credentials this workspace expects each member to provide, with a
// coverage banner (N of M), per-definition tooltips explaining purpose, and a masked form to provide
// a missing value. Admins can add/remove definitions. SECURITY: values are write-only — encrypted
// server-side into a personal secret; nothing here ever reads a value back. Gated by SECRETS_VAULT.

interface CoverageItem {
  definitionId: string;
  key: string;
  displayName: string;
  description: string | null;
  required: boolean;
  status: "provided" | "missing";
  updatedAt: string | null;
}
interface Coverage {
  profileId: string;
  total: number;
  provided: number;
  missing: number;
  items: CoverageItem[];
}

export function MySecretsPanel() {
  const [{ data, fetching, error }, refetchCoverage] = useQuery<{
    userSecretCoverage: Coverage;
  }>({ query: USER_SECRET_COVERAGE_QUERY });
  const [, refetchDefs] = useQuery<{ userSecretDefinitions: unknown[] }>({
    query: USER_SECRET_DEFINITIONS_QUERY,
    pause: true,
  });

  const [, declare] = useMutation(DECLARE_USER_SECRET);
  const [, createDef] = useMutation(CREATE_USER_SECRET_DEFINITION);
  const [, deleteDef] = useMutation(DELETE_USER_SECRET_DEFINITION);

  const [busy, setBusy] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [openProvide, setOpenProvide] = useState<string | null>(null);
  const [newDef, setNewDef] = useState({
    key: "",
    displayName: "",
    description: "",
    required: true,
  });
  const [showAddDef, setShowAddDef] = useState(false);

  const coverage = data?.userSecretCoverage;
  const items = coverage?.items ?? [];
  const refresh = () => {
    refetchCoverage({ requestPolicy: "network-only" });
    refetchDefs({ requestPolicy: "network-only" });
  };

  async function onProvide(item: CoverageItem) {
    const value = values[item.definitionId];
    if (!value) return setFormErr(`Enter a value for ${item.displayName}`);
    setBusy(item.definitionId);
    setFormErr(null);
    try {
      const res = await declare({ definitionId: item.definitionId, value });
      if (res.error)
        return setFormErr(res.error.graphQLErrors[0]?.message ?? "Failed to save secret");
      setValues((m) => ({ ...m, [item.definitionId]: "" }));
      setOpenProvide(null);
      setNotice(`Saved ${item.displayName}.`);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onAddDefinition() {
    const key = newDef.key.trim();
    if (!key) return setFormErr("A key is required");
    setBusy("new-def");
    setFormErr(null);
    try {
      const res = await createDef({
        key,
        displayName: newDef.displayName.trim() || key,
        description: newDef.description.trim() || null,
        required: newDef.required,
      });
      if (res.error)
        return setFormErr(res.error.graphQLErrors[0]?.message ?? "Failed to add definition");
      setNewDef({ key: "", displayName: "", description: "", required: true });
      setShowAddDef(false);
      setNotice(`Added "${key}".`);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteDefinition(item: CoverageItem) {
    setBusy(item.definitionId);
    try {
      await deleteDef({ id: item.definitionId });
      setNotice(`Removed "${item.key}".`);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  // Error state.
  if (error) {
    return (
      <Card className="p-4">
        <p className="text-sm text-destructive" role="alert">
          Couldn&apos;t load your secret coverage. Try again.
        </p>
      </Card>
    );
  }

  // Loading state.
  if (fetching && !coverage) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Spinner /> Loading your secrets…
      </Card>
    );
  }

  const total = coverage?.total ?? 0;
  const provided = coverage?.provided ?? 0;
  const complete = total > 0 && provided >= total;

  return (
    <div className="space-y-4">
      {/* Coverage banner — "N of M required secrets". Success (green) when complete, warning otherwise. */}
      {total > 0 && (
        <div
          role="status"
          className={
            "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm " +
            (complete
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300")
          }
        >
          {complete ? (
            <ShieldCheck className="h-5 w-5 shrink-0" />
          ) : (
            <ShieldAlert className="h-5 w-5 shrink-0" />
          )}
          <span>
            You have{" "}
            <span className="font-semibold">
              {provided} of {total}
            </span>{" "}
            required secrets.{" "}
            {complete ? "You're all set." : "Provide the rest to unblock your agents."}
          </span>
        </div>
      )}

      {formErr && (
        <p
          className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {formErr}
        </p>
      )}
      {notice && (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      )}

      {/* Admin: add a definition. */}
      <WhenAdmin>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Required secret definitions</h3>
            <Button size="sm" variant="ghost" onClick={() => setShowAddDef((v) => !v)}>
              <Plus className="mr-1 h-4 w-4" /> Add definition
            </Button>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            Define credentials each member must provide (admin only). Members supply their own
            values.
          </p>
          {showAddDef && (
            <div className="grid grid-cols-1 gap-2 rounded border border-dashed border-border p-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Key (UPPER_SNAKE)
                <input
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  placeholder="GITHUB_TOKEN"
                  value={newDef.key}
                  onChange={(e) => setNewDef((d) => ({ ...d, key: e.target.value.toUpperCase() }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Display name
                <input
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  placeholder="GitHub token"
                  value={newDef.displayName}
                  onChange={(e) => setNewDef((d) => ({ ...d, displayName: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Purpose (shown as a tooltip)
                <input
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  placeholder="Used by agents to open PRs on your behalf"
                  value={newDef.description}
                  onChange={(e) => setNewDef((d) => ({ ...d, description: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={newDef.required}
                  onChange={(e) => setNewDef((d) => ({ ...d, required: e.target.checked }))}
                />
                Required (counts toward coverage)
              </label>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Button size="sm" disabled={busy === "new-def"} onClick={onAddDefinition}>
                  Save definition
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddDef(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      </WhenAdmin>

      {/* Empty state — no definitions yet. */}
      {items.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-6 w-6" />}
          title="No required secrets"
          description="This workspace hasn't defined any user secrets yet. When an admin adds one, it appears here for you to provide."
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isProvided = item.status === "provided";
            const open = openProvide === item.definitionId;
            return (
              <Card key={item.definitionId} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{item.displayName}</span>
                  <Badge variant="gray">{item.key}</Badge>
                  {item.required ? (
                    <Badge variant="yellow">required</Badge>
                  ) : (
                    <Badge variant="gray">optional</Badge>
                  )}
                  <Badge variant={isProvided ? "green" : "red"}>
                    {isProvided ? "provided" : "missing"}
                  </Badge>
                  {item.description && (
                    <Tooltip content={item.description}>
                      <span
                        className="inline-flex cursor-help text-muted-foreground"
                        tabIndex={0}
                        aria-label={`Purpose: ${item.description}`}
                      >
                        <Info className="h-4 w-4" />
                      </span>
                    </Tooltip>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isProvided ? "ghost" : "secondary"}
                      onClick={() =>
                        setOpenProvide((o) => (o === item.definitionId ? null : item.definitionId))
                      }
                    >
                      {isProvided ? "Update" : "Provide"}
                    </Button>
                    <WhenAdmin>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === item.definitionId}
                        onClick={() => onDeleteDefinition(item)}
                        aria-label={`Delete definition ${item.key}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </WhenAdmin>
                  </span>
                </div>

                {open && (
                  <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border p-2">
                    <label className="sr-only" htmlFor={`val-${item.definitionId}`}>
                      Value for {item.displayName}
                    </label>
                    <input
                      id={`val-${item.definitionId}`}
                      className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                      type="password"
                      autoComplete="off"
                      placeholder={`New value for ${item.key}`}
                      value={values[item.definitionId] ?? ""}
                      onChange={(e) =>
                        setValues((m) => ({ ...m, [item.definitionId]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onProvide(item);
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={busy === item.definitionId}
                      onClick={() => onProvide(item)}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
