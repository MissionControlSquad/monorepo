# Epic #10 — Skills studio / catalog + Teams catalog

**Phase:** 4 (Depth) · **Gap:** 🟠 Medium · **Dependencies:** #1 (buildbase tenancy), #2 (`Agent.adapterType`
for future adapter-scoped skills), reuses the existing code-level `AGENT_TEMPLATES` + `Agent.templateId`.

Ports Paperclip's per-workspace **skills library** (`company_skills*`) and **teams catalog**. Grounded in
Paperclip `schema/company_skills.ts` + `types/{company-skill,teams-catalog,company-portability}.ts`.

## 0. Decisions-in-force / deviations
- **D5** — every root carries `workspaceId String` (no FK, indexed); reads `scoped(ctx)`, writes `requireRole`.
- **Deviation 1 — queryable assignment.** Paperclip stores agent→skill in `agents.adapter_config.paperclipSkillSync`.
  We use a first-class **`AgentSkill`** join (agentId, skillId, pinnedVersion) for queryability + `installCount`.
- **Deviation 2 — teams get DB tables.** Paperclip teams are a file catalog (install writes agents). We model
  **`Team`/`TeamMember`/`TeamInstall`** so authoring + install history are queryable; install still creates `Agent`s.
- **Trust ladder (not a boolean).** `trustLevel ∈ {markdown_only, assets, scripts_executables}` (+`external_sources`
  for teams). `sourceType ∈ {local_path, github, url, catalog}`.

## 1. Requirements
- **R1.** Admin/member author a `Skill` (workspace-scoped): `key` (unique/ws), `name`, `markdown`, `description?`,
  `categories[]`, `sourceType`, `trustLevel`, `sharingScope`. Create snapshots `SkillVersion` rev 1.
- **R2.** Edit a skill; a `markdown` change snapshots a new `SkillVersion` (rev+1) and bumps `currentVersion`.
- **R3.** `forkSkill` clones a skill (+ its current version) into a new skill with `forkedFromSkillId`, bumping the
  source's `forkCount`.
- **R4.** `starSkill`/`unstarSkill` toggles a per-actor star (`SkillStar`, unique per (skill, profile)) and keeps
  `starCount` in sync.
- **R5.** Assign/unassign a skill to an `Agent` (`AgentSkill`, unique per (agent, skill), optional `pinnedVersion`);
  keeps `Skill.installCount` = distinct assigned agents.
- **R6.** Author a `Team` (`key` unique/ws, `name`, `kind`, `trustLevel`) with ordered `TeamMember`s (`name`, `role`,
  optional `templateId`, `skills[]`, `config`).
- **R7.** `installTeam(collisionStrategy)` creates one `Agent` per member in the caller's workspace, applying
  `collisionStrategy ∈ {rename, skip, replace}` on name/username collision; records a `TeamInstall` with the created
  agent ids; bumps team install count. `replace` overwrites; `skip` leaves the existing; `rename` de-dupes the name.
- **R8.** Browse `teams`, `team`, `skills`, `skill`, `skillVersions`, `agentSkills(agentId)` — workspace-isolated.
- **R9.** Every query + mutation gated by `requireFeature(FLAG_KEYS.SKILLS_TEAMS)`; authoring/install `requireRole`
  (`member` authors + assigns; `admin` installs a team — it provisions agents = a plan-quota-adjacent action).

## 2. Non-goals / guardrails
- **DO NOT** build the skill test-run studio (test inputs/templates/runs — needs agent execution), comments, or the
  file-based catalog browser — **deferred**.
- **DO NOT** store skill assignment in `adapterConfig` (use `AgentSkill`); **DO NOT** FK `workspaceId`.
- **DO NOT** let a team `replace`-install silently clobber a running agent without recording it in `TeamInstall`.
- **DO NOT** conflate with `AGENT_TEMPLATES` (code catalog) — `TeamMember.templateId` may *reference* a template id,
  but teams are DB rows.

## 3. Data model — `packages/database/prisma/schema/skill.prisma`
```prisma
enum SkillSourceType   { local_path github url catalog }
enum SkillTrustLevel   { markdown_only assets scripts_executables }
enum SkillSharingScope { private workspace public }
enum TeamKind          { bundled optional }
enum TeamTrustLevel    { markdown_only assets scripts_executables external_sources }
enum CollisionStrategy { rename skip replace }

model Skill { id, workspaceId, key, slug, name, description?, markdown, sourceType, sourceRef?, trustLevel,
  categories String[] @default([]), sharingScope, forkedFromSkillId?, starCount Int@0, installCount Int@0,
  forkCount Int@0, currentVersion Int@1, createdByProfileId?, createdAt, updatedAt;
  versions, agentSkills, stars, forkedFrom(self), createdByProfile;
  @@unique([workspaceId, key]); @@index([workspaceId]); @@index([workspaceId, sharingScope]); @@map("skills") }
model SkillVersion { id, workspaceId, skillId, revisionNumber, label?, content, createdByProfileId?, createdAt;
  @@unique([skillId, revisionNumber]); @@map("skill_versions") }
model SkillStar { id, workspaceId, skillId, profileId, createdAt; @@unique([skillId, profileId]); @@map("skill_stars") }
model AgentSkill { id, workspaceId, agentId, skillId, pinnedVersion?, createdAt;
  @@unique([agentId, skillId]); @@index([skillId]); @@map("agent_skills") }
model Team { id, workspaceId, key, name, description?, kind, trustLevel, sourceRef?, installCount Int@0,
  createdByProfileId?, createdAt, updatedAt; members, installs; @@unique([workspaceId, key]); @@map("teams") }
model TeamMember { id, workspaceId, teamId, name, role, templateId?, skills String[]@[], config Json?, order Int@0,
  createdAt; @@index([teamId]); @@map("team_members") }
model TeamInstall { id, workspaceId, teamId, collisionStrategy, createdAgentIds String[]@[], installedByProfileId?,
  installedAt; @@index([teamId]); @@map("team_installs") }
```
Edits: `Agent += skills AgentSkill[]`; `Profile += createdSkills/createdTeams/skillStars`.

## 4-8. API / migration / files
- **Flag** `FLAG_KEYS.SKILLS_TEAMS` (default true; startup seed). Migration `add_skills_teams`: 9 tables + 6 enums.
- **Services** `services/skills.ts` (create+v1, update→version, fork, star/unstar, assign/unassign + installCount) and
  `services/teams.ts` (create, addMember, installTeam w/ pure `resolveCollision`, listTeams). Pure helpers:
  `slugify(name)`, `resolveCollision(existingNames, memberName, strategy)`.
- **GraphQL** `types/{skill,team}.ts` prismaObjects; queries `skills/skill/skillVersions/agentSkills/teams/team`;
  mutations `createSkill/updateSkill/forkSkill/starSkill/unstarSkill/assignSkill/unassignSkill`, `createTeam/
  addTeamMember/installTeam`.
- **UI** `/skills` (library: author markdown, versions, fork/star, assign to agent) + `/teams` (catalog: author team +
  members, install w/ collision strategy, install history).

## 9. Implementation order
1. Schema + back-relations + migration + flag. 2. Services + pure helpers + unit tests. 3. GraphQL + integration
tests. 4. UI + client.

## 10. Test cases
- Unit: `slugify`; `resolveCollision` (rename de-dupes, skip returns skip, replace returns replace).
- Integration: create skill → version rev1; update markdown → rev2 + currentVersion bump; fork → new skill +
  forkedFromSkillId + source forkCount++; star toggles starCount + unique; assign → AgentSkill + installCount, dup
  rejected; create team + members; installTeam(rename) creates N agents; collision with an existing agent → rename/
  skip/replace behavior + TeamInstall records createdAgentIds; workspace isolation; feature gate.

## 11. Definition of Done
Skills author + version-on-change + fork + star + assign (installCount accurate); teams author + install creating
agents with the 3 collision strategies + install record; workspace isolation proven; all gated by SKILLS_TEAMS +
role; unit+integration green.

## 12. Risks
- **Team install blast radius** → `admin` only; `replace` recorded in `TeamInstall`; agent creation reuses the
  existing create path/validation.
- **Version/star drift** → `currentVersion`/`starCount`/`installCount` maintained transactionally next to the join
  writes; covered by tests.
- **Name collision correctness** → pure `resolveCollision` unit-tested; install is `admin` + previewable.
