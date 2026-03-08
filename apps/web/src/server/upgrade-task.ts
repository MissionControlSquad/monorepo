/**
 * Title and description for the "upgrade your config" task we create when the user
 * clicks "Ask agent to patch" in the dashboard.
 */
export const UPGRADE_CONFIG_TASK = {
  title: "Upgrade your AgentCenter config",
  description: `Mission Control has updated HEARTBEAT, PLAYBOOK, or APIs. Your task:

1. **Fetch the current config** — Call \`GET /api/agents/me/config-bundle\` (with your API key). You will get a list of files and the current config version.

2. **Compare with your local files** — For each file in the bundle (HEARTBEAT.md, PLAYBOOK.md, AGENTS.md, etc.), compare with your workspace copy. Note what changed or is missing.

3. **Report** — Post a short message on this task summarizing what changed (e.g. "HEARTBEAT: added new step; PLAYBOOK: 2 new endpoints").

4. **Apply the update** — Overwrite your local config files with the bundle contents so your workspace matches the current version. Then run sync_identity with the new \`configVersion\` from the bundle so the system knows you're up to date.

5. **Verify** — After updating, confirm you can still follow HEARTBEAT and use the APIs as documented.

**Keep your existing knowledge.** Do not change MEMORY.md, your SOUL, or your domain skills beyond what the new config files say. This upgrade is only about AgentCenter tooling (HEARTBEAT, PLAYBOOK, endpoints)—update your knowledge of how to talk to Mission Control and follow the workflow; keep everything else as is.`,
} as const;
