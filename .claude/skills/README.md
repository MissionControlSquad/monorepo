# AgentCenter skills

Repo-scoped, version-controlled skills that encode how we build AgentCenter to an enterprise
standard. They are **rules a coding agent (Claude Code, or a human) applies process-by-process** —
not optional advice. Each skill is a `SKILL.md` with `name` + `description` frontmatter.

> **For Codex / non-Claude agents:** these are plain Markdown rule files. Read the relevant
> `SKILL.md` before doing the matching kind of work; they point at the deeper specs in
> `docs/gap-plans/` (`CONVENTIONS.md` + per-epic files).

## Index

| Skill | Use when |
|---|---|
| [`agentcenter-conventions`](./agentcenter-conventions/SKILL.md) | ANY change to this repo — the binding rules (D1–D5, stack conventions). Read first. |
| [`buildbase-tenancy`](./buildbase-tenancy/SKILL.md) | Anything touching auth, workspaces, human roles, feature flags, billing, or `workspaceId` scoping. |
| [`prisma-graphql-patterns`](./prisma-graphql-patterns/SKILL.md) | Adding/changing a Prisma model, GraphQL type/resolver, or REST route. |
| [`migration-safety`](./migration-safety/SKILL.md) | Any database migration. |
| [`testing-standards`](./testing-standards/SKILL.md) | Writing tests (unit / integration / e2e / concurrency / isolation). |
| [`security-review`](./security-review/SKILL.md) | Reviewing or writing auth, secrets, workspace isolation, webhooks, plugins. |
| [`ui-ux-design`](./ui-ux-design/SKILL.md) | Building or changing any UI (dashboard/mobile). |
| [`code-review`](./code-review/SKILL.md) | Reviewing a diff before merge. |
| [`epic-spec-authoring`](./epic-spec-authoring/SKILL.md) | Writing/updating a `docs/gap-plans/NN-*.md` epic spec. |

## Growing this pack

Add a new skill as `.claude/skills/<kebab-name>/SKILL.md` with frontmatter, list it above, and commit.
Prefer repo-specific, evidence-grounded rules over generic advice. When a public skill is useful,
adapt its rules into an original file here (keep provenance in a comment) rather than vendoring code.
