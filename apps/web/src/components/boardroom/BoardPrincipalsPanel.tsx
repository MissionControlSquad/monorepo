"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { Info, KeyRound, ShieldCheck, Trash2, Copy } from "lucide-react";
import { BOARD_PRINCIPALS_QUERY } from "@/lib/graphql/queries";
import { CREATE_BOARD_PRINCIPAL, REVOKE_BOARD_PRINCIPAL } from "@/lib/graphql/mutations";
import { BOARD_PRINCIPAL_ROLES, describeBoardRole } from "@agentcenter/utils";
import type { BoardPrincipalRole } from "@agentcenter/utils";
import { Button, Card, ConfirmDialog, FormDialog, Select, Tooltip, Badge } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";

interface Principal {
  id: string;
  name: string;
  role: string;
  keyPrefix: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface Minted {
  name: string;
  role: string;
  keyPrefix: string;
  plainKey: string;
}

// Board principals — first-class board identities that can act in the boardroom, authenticated by their
// own board API key (the existing hashed-at-rest key scheme). admin-only surface; BOARD_CHAT-gated.
export function BoardPrincipalsPanel() {
  const [{ data, fetching }, refetch] = useQuery<{ boardPrincipals: Principal[] }>({
    query: BOARD_PRINCIPALS_QUERY,
  });
  const [, create] = useMutation(CREATE_BOARD_PRINCIPAL);
  const [, revoke] = useMutation(REVOKE_BOARD_PRINCIPAL);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<BoardPrincipalRole>("member");
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<Minted | null>(null);
  const [toRevoke, setToRevoke] = useState<Principal | null>(null);

  const principals = data?.boardPrincipals ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function submitCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await create({ name: name.trim(), role });
      if (res.error) {
        toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to create board principal");
        return;
      }
      const p = res.data.createBoardPrincipal;
      setMinted({ name: p.name, role: p.role, keyPrefix: p.keyPrefix, plainKey: p.plainKey });
      setCreateOpen(false);
      setName("");
      setRole("member");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!toRevoke) return;
    setBusy(true);
    try {
      const res = await revoke({ id: toRevoke.id });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to revoke");
      else {
        toast.success(`Board principal "${toRevoke.name}" revoked`);
        refresh();
      }
    } finally {
      setBusy(false);
      setToRevoke(null);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
            Board principals
            <Tooltip
              content="A board principal is a first-class board identity — not a human operator — that can act in the boardroom (post messages, read the thread) using its own board API key. What it may do is set by its role."
              side="bottom"
            >
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </Tooltip>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Identities that can act in the boardroom via a board API key. Revoking one immediately
            invalidates its key.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          New principal
        </Button>
      </div>

      {fetching && principals.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading board principals…</p>
      )}
      {!fetching && principals.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No board principals yet. Create one to give the board a first-class identity in this
          workspace.
        </p>
      )}

      {principals.length > 0 && (
        <ul className="divide-y divide-border">
          {principals.map((p) => {
            const revoked = Boolean(p.revokedAt);
            return (
              <li key={p.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {p.name}
                    <Tooltip
                      content={describeBoardRole(p.role as BoardPrincipalRole)}
                      side="bottom"
                    >
                      <Badge variant={revoked ? "gray" : "indigo"}>{p.role}</Badge>
                    </Tooltip>
                    {revoked && <Badge variant="red">revoked</Badge>}
                  </p>
                  {p.keyPrefix && (
                    <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <KeyRound className="h-3 w-3" />
                      {p.keyPrefix}…
                    </p>
                  )}
                </div>
                {!revoked && (
                  <Tooltip content="Revoke this principal and its board API key" side="bottom">
                    <button
                      onClick={() => setToRevoke(p)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Revoke ${p.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Create form */}
      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New board principal"
        description="Mints a board API key shown once. Store it securely — it cannot be retrieved again."
        onSubmit={submitCreate}
        submitLabel="Create & mint key"
        busy={busy}
        submitDisabled={!name.trim()}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Board"
          />
        </label>
        <label className="block space-y-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            Role
            <Tooltip
              content="Chair & member can read the thread, post messages, and rate replies. Observer is read-only."
              side="top"
            >
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </Tooltip>
          </span>
          <Select value={role} onChange={(e) => setRole(e.target.value as BoardPrincipalRole)}>
            {BOARD_PRINCIPAL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted-foreground">{describeBoardRole(role)}</span>
        </label>
      </FormDialog>

      {/* Mint-once key display */}
      <MintedKeyDialog minted={minted} onClose={() => setMinted(null)} />

      {/* Revoke confirm */}
      <ConfirmDialog
        isOpen={Boolean(toRevoke)}
        onClose={() => setToRevoke(null)}
        onConfirm={confirmRevoke}
        title={`Revoke "${toRevoke?.name}"?`}
        description={
          "This immediately invalidates the board API key for this principal. Any integration " +
          "authenticating as it will stop working. This cannot be undone."
        }
        confirmLabel="Yes, revoke"
        variant="danger"
        loading={busy}
      />
    </Card>
  );
}

function MintedKeyDialog({ minted, onClose }: { minted: Minted | null; onClose: () => void }) {
  return (
    <FormDialog
      open={Boolean(minted)}
      onOpenChange={(o) => !o && onClose()}
      title="Board API key — copy it now"
      description="This is the only time the key is shown. Store it securely; it is hashed at rest and cannot be retrieved again."
      onSubmit={onClose}
      submitLabel="Done"
    >
      {minted && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Key for <span className="font-medium text-foreground">{minted.name}</span> (
            {minted.role})
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
              {minted.plainKey}
            </code>
            <Tooltip content="Copy to clipboard" side="top">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(minted.plainKey);
                  toast.success("Copied board key");
                }}
                className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label="Copy key"
              >
                <Copy className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
