"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Terminal, Check, X } from "lucide-react";
import { CLI_AUTH_CHALLENGE_QUERY } from "@/lib/graphql/queries";
import { APPROVE_CLI_AUTH, DENY_CLI_AUTH } from "@/lib/graphql/mutations";
import { Button, Card, PageLayout } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";
import { formatUserCode, isValidUserCode, normalizeUserCode } from "@agentcenter/utils";

// Epic #12: browser approval page for a CLI device-auth login. The user confirms the short code the
// CLI printed; approving mints an API key bound to this workspace (admin-only, enforced server-side).

export function CliAuthApprovePage() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [done, setDone] = useState<null | "approved" | "denied">(null);

  useEffect(() => {
    const fromUrl = params.get("code");
    if (fromUrl) setCode(formatUserCode(fromUrl));
  }, [params]);

  const valid = isValidUserCode(code);
  const [{ data, fetching }] = useQuery<{
    cliAuthChallenge: { keyName: string; status: string } | null;
  }>({
    query: CLI_AUTH_CHALLENGE_QUERY,
    variables: { userCode: normalizeUserCode(code) },
    pause: !valid,
  });
  const [, approve] = useMutation(APPROVE_CLI_AUTH);
  const [, deny] = useMutation(DENY_CLI_AUTH);
  const [busy, setBusy] = useState(false);

  const challenge = data?.cliAuthChallenge;

  async function doApprove() {
    setBusy(true);
    try {
      const res = await approve({ userCode: normalizeUserCode(code) });
      if (res.error) {
        toast.error(res.error.message.replace("[GraphQL] ", ""));
        return;
      }
      setDone("approved");
    } finally {
      setBusy(false);
    }
  }
  async function doDeny() {
    setBusy(true);
    try {
      await deny({ userCode: normalizeUserCode(code) });
      setDone("denied");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageLayout maxWidth="narrow">
      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">Authorize CLI</h1>
        </div>

        {done === "approved" ? (
          <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-muted p-3 text-sm text-success">
            <Check className="mt-0.5 h-4 w-4" />
            <span>Approved. Return to your terminal — the CLI will pick up the key shortly.</span>
          </div>
        ) : done === "denied" ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            <X className="mt-0.5 h-4 w-4" />
            <span>Login request denied.</span>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Enter the code shown in your terminal to authorize a new CLI login for this workspace.
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Code</span>
              <Input
                value={code}
                onChange={(e) => setCode(formatUserCode(e.target.value))}
                placeholder="ABCD-2345"
                className="font-mono tracking-widest"
              />
            </label>

            {valid && !fetching && !challenge && (
              <p className="text-sm text-destructive">That code is not valid.</p>
            )}
            {challenge && challenge.status !== "pending" && (
              <p className="text-sm text-destructive">
                This code is {challenge.status} and can no longer be used.
              </p>
            )}
            {challenge && challenge.status === "pending" && (
              <div className="rounded-lg border border-border p-3 text-sm">
                Authorizing a key named{" "}
                <span className="font-medium text-foreground">{challenge.keyName}</span>.
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || !challenge || challenge.status !== "pending"}
                onClick={doDeny}
              >
                Deny
              </Button>
              <Button
                size="sm"
                loading={busy}
                disabled={busy || !challenge || challenge.status !== "pending"}
                onClick={doApprove}
              >
                Approve
              </Button>
            </div>
          </>
        )}
      </Card>
    </PageLayout>
  );
}
