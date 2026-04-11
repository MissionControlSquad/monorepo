"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Copy,
  Check,
  Key,
  AlertTriangle,
  X,
  Loader2,
  Monitor,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs, Button, Badge, Card, Input, EmptyState, PageLayout } from "../components/ui";
import { ErrorBoundary, PanelErrorFallback } from "../components/common/ErrorBoundary";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface LiveConnection {
  id: string;
  machineName: string | null;
  connectionStatus: string;
  connectedAt: string | null;
  lastDisconnectedAt: string | null;
  pluginVersion: string | null;
  agentSlugs: string[];
  createdAt: string;
}

type Tab = "connections" | "tokens";

// ─── Token panel ──────────────────────────────────────────────────────────────

function TokenPanel() {
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
      if (!res.ok) throw new Error();
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
            Paste into the mc-bridge plugin config. Used once on first connect — a per-machine token
            replaces it automatically.
          </p>
        </div>
        {!showForm && (
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setShowForm(true)}>
            Generate Token
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-medium text-foreground">New install token</p>
          <Input
            placeholder="Label (optional, e.g. 'dev-laptop')"
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
                  Label: {newToken.name}
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
            Set as <code className="font-mono">token</code> in your mc-bridge plugin config. After
            first connect MC issues a per-machine token — update config and restart the plugin.
          </p>
        </Card>
      )}

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

// ─── Connection card ──────────────────────────────────────────────────────────

function ConnectionCard({ conn }: { conn: LiveConnection }) {
  const isLive = conn.connectionStatus === "connected";

  return (
    <div className="px-4 py-3 flex items-start gap-4">
      <div className="flex-shrink-0 mt-0.5">
        {isLive ? (
          <Wifi className="w-4 h-4 text-success" />
        ) : (
          <WifiOff className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-foreground truncate">
            {conn.machineName || conn.id.slice(0, 12)}
          </span>
          <Badge variant={isLive ? "green" : "gray"}>{isLive ? "Live" : "Offline"}</Badge>
          {conn.pluginVersion && (
            <span className="text-xs text-muted-foreground font-mono">v{conn.pluginVersion}</span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {isLive && conn.connectedAt ? (
            <span>Connected {new Date(conn.connectedAt).toLocaleString()}</span>
          ) : conn.lastDisconnectedAt ? (
            <span>Last seen {new Date(conn.lastDisconnectedAt).toLocaleString()}</span>
          ) : (
            <span>Never connected</span>
          )}
        </div>

        {conn.agentSlugs.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {conn.agentSlugs.map((slug) => (
              <span
                key={slug}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] text-muted-foreground font-mono"
              >
                @{slug}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LiveGatewayPage() {
  const [connections, setConnections] = useState<LiveConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("connections");

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/live-gateway/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    const interval = setInterval(fetchConnections, 15_000);
    return () => clearInterval(interval);
  }, [fetchConnections]);

  const liveCount = connections.filter((c) => c.connectionStatus === "connected").length;

  return (
    <PageLayout>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Live Gateway" }]} />
      <ErrorBoundary
        fallback={({ resetErrorBoundary, error }) => (
          <PanelErrorFallback label="Live Gateway" error={error} onRetry={resetErrorBoundary} />
        )}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-500" />
              Live Gateway
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time task delivery to any machine running the mc-bridge plugin.
            </p>
          </div>
        </div>

        {/* Setup callout — shown when no connections yet */}
        {!loading && connections.length === 0 && (
          <Card className="p-5 mb-6 border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                  Connect your first machine
                </p>
                <ol className="text-xs text-indigo-700 dark:text-indigo-400 space-y-1 list-decimal list-inside">
                  <li>Generate an install token below.</li>
                  <li>
                    Download the{" "}
                    <span className="font-mono bg-indigo-100 dark:bg-indigo-900/40 px-1 rounded">
                      mc-bridge
                    </span>{" "}
                    OpenClaw plugin and drop it in your plugins directory.
                  </li>
                  <li>
                    Set{" "}
                    <span className="font-mono bg-indigo-100 dark:bg-indigo-900/40 px-1 rounded">
                      mcUrl
                    </span>{" "}
                    and{" "}
                    <span className="font-mono bg-indigo-100 dark:bg-indigo-900/40 px-1 rounded">
                      token
                    </span>{" "}
                    in the plugin config, restart OpenClaw.
                  </li>
                  <li>
                    Machine appears here. Tasks assigned to its agents are delivered instantly.
                  </li>
                </ol>
              </div>
            </div>
          </Card>
        )}

        {/* Stats row */}
        {connections.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Connected</p>
              <p className="text-2xl font-bold text-success">{liveCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total machines</p>
              <p className="text-2xl font-bold text-foreground">{connections.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Agents routed</p>
              <p className="text-2xl font-bold text-foreground">
                {connections.reduce((s, c) => s + c.agentSlugs.length, 0)}
              </p>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {(["connections", "tokens"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "connections" ? <Monitor className="w-4 h-4" /> : <Key className="w-4 h-4" />}
              {t === "connections" ? "Machines" : "Install Tokens"}
            </button>
          ))}
        </div>

        {/* Tokens tab */}
        {tab === "tokens" && <TokenPanel />}

        {/* Connections tab */}
        {tab === "connections" && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : connections.length === 0 ? (
              <EmptyState
                icon={<Monitor />}
                title="No machines connected yet"
                description="Install the mc-bridge plugin on any machine and it will appear here."
              />
            ) : (
              <Card className="overflow-hidden divide-y divide-border">
                {connections.map((conn) => (
                  <ConnectionCard key={conn.id} conn={conn} />
                ))}
              </Card>
            )}
          </>
        )}
      </ErrorBoundary>
    </PageLayout>
  );
}
