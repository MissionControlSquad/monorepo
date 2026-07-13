# Epic #21 — Agent authorization (capability grants)

**Phase:** 3 (Agent governance) · **Gap:** 🟠 Medium-high (closes the agent-authz asymmetry) ·
**Dependencies:** #1 (tenancy), #3 (`AgentTrustProfile`), `Agent`.

Humans get grantable, custom roles via the **buildbase console** (buildbase = humans only, D1 of #1).
Agents are never buildbase principals, so their permissions live entirely in *our* code — today as a
scattered mix (narrow route surface + trust level + a flat `executionAllowlist` + secret bindings +
budgets). There is **no grantable, scoped, audited agent-capability model** — the agent analog of a
buildbase role — and the trust/execution gate (`evaluateTrust`) is **defined but not enforced** on the
action path. This epic adds that model and wires enforcement. Grounded in Paperclip
`principal_permission_grants` (principalType=`agent`), `agent-permissions.ts`, and our existing
`services/trust.ts`.

## 0. Decisions / deviations
- **D1 (unify, don't replace)** — the new `AgentCapabilityGrant` (agent → capability → optional project
  scope → grantedBy) is the structured, provenance-tracked successor to the flat
  `AgentTrustProfile.executionAllowlist`. `agentCan` treats **both** as allow-sources; the allowlist
  stays as a compat escape hatch.
- **D2 (open vs restricted mode)** — an agent is **open** by default (backward compatible: everything
  its routes already allow stays allowed) unless its trust profile sets `changeConsentRequired = true`,
  which flips it to **restricted**: only capabilities in `roleDefaults ∪ executionAllowlist ∪ grants`
  are permitted. This makes the model opt-in and non-breaking.
- **D3 (agent role defaults)** — `defaultCapabilitiesForRole(role)` gives every agent a baseline
  capability set; a CEO/lead role adds elevated ones (e.g. `agents.invoke`). Ported in spirit from
  `defaultPermissionsForRole`.
- **D4 (enforce + audit)** — a `requireAgentCapability(agent, capability, scope?)` helper resolves the
  agent's grants + trust profile, runs `agentCan`, records an `AgentAuthzEvent` on **denial**, and
  throws 403. Wired into a representative agent route to prove enforcement (the rest can adopt it
  incrementally). Closes the "gate defined-but-unwired" gap.
- **D5 (capabilities vocabulary)** — a curated `AGENT_CAPABILITIES` set in `@agentcenter/utils`
  (`docs.write`, `tasks.checkout`, `messages.send`, `agents.invoke`, `secrets.read`, `host.write`, …),
  mirroring the `PLUGIN_CAPABILITIES` pattern from #6.

## 1. Requirements
- **R1.** `AgentCapabilityGrant { agentId, capability, projectScope?, grantedByProfileId? }`, deduped per
  `(agentId, capability, projectScope)`. `AgentAuthzEvent { agentId, capability, decision, projectScope?,
  reason }` (audit).
- **R2.** Pure `agentCan(capability, { role, trustProfile, grants, scope? })` → `{ allowed, reason }`
  implementing D2 (open→allow; restricted→role defaults ∪ allowlist ∪ scoped grants).
- **R3.** `grantAgentCapability`, `revokeAgentCapability`, `listAgentGrants` (workspace-scoped via the
  agent); `requireAgentCapability` (resolve + decide + audit denial + throw 403).
- **R4.** Grants management is `admin` (granting authority is privileged); reads `member`; gated by
  `requireFeature(FLAG_KEYS.AGENT_AUTHZ)`, workspace-isolated via the agent.
- **R5.** Enforcement wired into ≥1 real agent route, default-open (non-breaking), restricted-enforced.

## 2. Non-goals / guardrails
- **DO NOT** touch human RBAC (buildbase owns it, D1 of #1).
- **DO NOT** make agents restricted by default (D2) — no behavior change until `changeConsentRequired`.
- **DO NOT** grant a capability outside `AGENT_CAPABILITIES` (validated).
- **DO NOT** let a cross-workspace agent be targeted (validate via workspace-scoped fetch).

## 3. Data model — `packages/database/prisma/schema/agent-authz.prisma`
```prisma
enum AgentAuthzDecision { allow deny }

model AgentCapabilityGrant {
  id                 String   @id @default(cuid())
  agentId            String
  agent              Agent    @relation("AgentGrants", fields: [agentId], references: [id], onDelete: Cascade)
  capability         String
  projectScope       String?  // null = workspace-wide; else a project id
  grantedByProfileId String?
  createdAt          DateTime @default(now())
  @@index([agentId, capability])
  @@map("agent_capability_grants")
}

model AgentAuthzEvent {
  id           String            @id @default(cuid())
  agentId      String
  capability   String
  decision     AgentAuthzDecision
  projectScope String?
  reason       String?
  createdAt    DateTime          @default(now())
  @@index([agentId, createdAt])
  @@map("agent_authz_events")
}
```
Adds back-relation `capabilityGrants AgentCapabilityGrant[] @relation("AgentGrants")` to `Agent`.

## 4-8. API / files
- **Constants** `@agentcenter/utils` `AGENT_CAPABILITIES` + `isAgentCapability`. **Flag**
  `FLAG_KEYS.AGENT_AUTHZ` (default true; startup seed).
- **Service** `services/agent-authz.ts`: pure `defaultCapabilitiesForRole`, `agentCan`; `grantAgentCapability`,
  `revokeAgentCapability`, `listAgentGrants`, `listAuthzEvents`, `requireAgentCapability`.
- **GraphQL** query `agentCapabilityGrants(agentId)` + `agentAuthzEvents(agentId)`; mutations
  `grantAgentCapability`, `revokeAgentCapability` (admin).
- **Enforcement** `requireAgentCapability` wired into a representative agent route.
- **UI** `/agent-authz`: per-agent grants (grant/revoke), restricted-mode badge, recent denials.

## 9. Implementation order
1. Schema + constants + flag. 2. Service + pure `agentCan` + unit tests. 3. GraphQL + enforcement wiring
+ integration tests. 4. UI + client + nav.

## 10. Test cases
- Unit: `agentCan` — open mode allows anything; restricted denies an ungranted capability; restricted
  allows a role-default / an allowlisted / an explicitly-granted (scope-matched) capability; a
  project-scoped grant is rejected for a different project. `defaultCapabilitiesForRole` (base vs CEO).
- Integration: grant then revoke; a restricted agent without the grant is denied + an `AgentAuthzEvent`
  is recorded; the same agent with the grant is allowed; grant a capability outside the vocab is
  rejected; cross-workspace agent rejected; isolation; gate.

## 11. Definition of Done
A grantable, scoped, provenance-tracked agent-capability model unifying the trust allowlist, with an
`agentCan` decision (open/restricted), enforcement wired into a real route + denial audit, and admin
management; non-breaking (default-open); gated by AGENT_AUTHZ; unit+integration green.

## 12. Risks
- **Breaking existing agents** → default-open (D2); enforcement only bites `changeConsentRequired` agents.
- **Privilege escalation via self-grant** → grants are `admin`-only; agents can't grant themselves.
- **Cross-workspace / bogus capability** → validated against the workspace-scoped agent + the
  `AGENT_CAPABILITIES` vocabulary.
- **Unenforced gate (the original bug)** → `requireAgentCapability` wired into a real route + audited.
