"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Copy, Check, Key, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Input } from "../ui";

interface Token {
  id: string;
  prefix: string;
  name: string | null;
  maskedToken: string;
}

interface NewTokenResult {
  token: string;
  prefix: string;
  name: string | null;
}

export function VMTokenPanel() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newToken, setNewToken] = useState<NewTokenResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch("/api/live-gateway/tokens");
      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens ?? []);
        setFetchError(false);
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/live-gateway/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Failed to create token");
      const data = await res.json();
      setNewToken({ token: data.token, prefix: data.prefix, name: data.name });
      setNewName("");
      setShowForm(false);
      await fetchTokens();
    } catch {
      toast.error("Failed to generate token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/live-gateway/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Token revoked");
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast.error("Failed to revoke token");
    } finally {
      setRevoking(null);
    }
  }

  function handleCopy() {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Install Tokens</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Used by the mc-bridge plugin to register new machines with Mission Control.
          </p>
        </div>
        {!showForm && (
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setShowForm(true)}>
            Generate Token
          </Button>
        )}
      </div>

      {/* New token creation form */}
      {showForm && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-medium text-foreground">New install token</p>
          <Input
            placeholder="Token name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              icon={creating ? undefined : <Key />}
            >
              {creating ? "Generating…" : "Generate"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* One-time token reveal */}
      {newToken && (
        <Card className="p-4 space-y-3 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                Copy this token now — it will not be shown again.
              </p>
              {newToken.name && (
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                  Name: {newToken.name}
                </p>
              )}
            </div>
            <button
              onClick={() => setNewToken(null)}
              className="ml-auto text-amber-600 hover:text-amber-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white dark:bg-black/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2 font-mono break-all select-all">
              {newToken.token}
            </code>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-2 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
              title="Copy token"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4 text-amber-600" />
              )}
            </button>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-500">
            Set this as <code className="font-mono">token</code> in your mc-bridge plugin config.
            After first connection MC will issue a per-VM token — replace and restart.
          </p>
        </Card>
      )}

      {/* Token list */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : fetchError ? (
        <p className="text-xs text-destructive">Failed to load tokens. Please refresh.</p>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active install tokens.</p>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {tokens.map((token) => (
            <div key={token.id} className="flex items-center gap-3 px-4 py-3">
              <Key className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {token.name ?? "Unnamed token"}
                </p>
                <p className="text-xs text-muted-foreground font-mono">{token.maskedToken}</p>
              </div>
              <button
                onClick={() => handleRevoke(token.id)}
                disabled={revoking === token.id}
                className="flex-shrink-0 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                title="Revoke token"
              >
                {revoking === token.id ? (
                  <span className="w-4 h-4 block animate-spin border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
