"use client";

import { useQuery, useMutation } from "urql";
import { SKILL_UPDATE_STATUS_QUERY } from "@/lib/graphql/queries";
import { RESET_SKILL_TO_ORIGIN } from "@/lib/graphql/mutations";
import { Button, Badge, Tooltip } from "@/components/ui";

// Skill catalog-update status + reset-to-origin (parity #F18/#F20). Shown in a skill row panel for
// catalog-installed skills. SKILLS_TEAMS-gated.
interface Status {
  state: string;
  originVersion: number | null;
  latestVersion: number | null;
}
const stateVariant = (s: string) =>
  s === "update_available"
    ? "yellow"
    : s === "up_to_date"
      ? "green"
      : s === "origin_gone"
        ? "red"
        : "gray";

export function SkillUpdatePanel({
  skillId,
  onChanged,
}: {
  skillId: string;
  onChanged?: () => void;
}) {
  const [{ data, fetching }, refetch] = useQuery<{ skillUpdateStatus: Status }>({
    query: SKILL_UPDATE_STATUS_QUERY,
    variables: { skillId },
  });
  const [, reset] = useMutation(RESET_SKILL_TO_ORIGIN);
  const st = data?.skillUpdateStatus;

  if (fetching && !st) return <p className="text-xs text-muted-foreground">Checking updates…</p>;
  if (!st || st.state === "not_installed")
    return (
      <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Not installed from a catalog — nothing to update.
      </p>
    );

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">
        <Badge variant={stateVariant(st.state)}>{st.state.replace(/_/g, " ")}</Badge>{" "}
        {st.originVersion != null && `installed from v${st.originVersion}`}
        {st.latestVersion != null &&
          st.latestVersion !== st.originVersion &&
          ` · source now v${st.latestVersion}`}
      </div>
      {(st.state === "update_available" || st.state === "up_to_date") && (
        <Tooltip content="Overwrites this skill with the source's current content and discards any local edits you've made — the opposite of keeping your version.">
          <Button
            size="sm"
            variant="secondary"
            disabled={st.state === "up_to_date"}
            onClick={async () => {
              if (
                confirm(
                  "Reset this skill to the origin's current content? Local edits are discarded.",
                )
              ) {
                await reset({ skillId });
                refetch({ requestPolicy: "network-only" });
                onChanged?.();
              }
            }}
          >
            Reset to origin
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
