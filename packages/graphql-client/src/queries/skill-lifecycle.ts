import { gql } from "urql";
export const SKILL_UPDATE_STATUS_QUERY = gql`query SkillUpdateStatus($skillId:String!){ skillUpdateStatus(skillId:$skillId){ state originVersion latestVersion } }`;
// Domain 5 real-import: the app-shipped skills catalog (curated, content-addressed bundles).
export const SKILL_CATALOG_PACKAGES_QUERY = gql`query SkillCatalogPackages{ skillCatalogPackages{ id key name description category tags trustLevel contentHash packageName } }`;
// §3 fork depth: warn before duplicating a fork of the same origin.
export const FORK_PRECHECK_QUERY = gql`query ForkPrecheck($skillId:String!){ forkPrecheck(skillId:$skillId){ originId hasExistingFork existingForkId existingForkName } }`;
// §3 project-workspace scan: SKILL.md bundles discovered in a project workspace's checked-out files.
export const PROJECT_WORKSPACE_SKILL_CANDIDATES_QUERY = gql`query ProjectWorkspaceSkillCandidates($projectWorkspaceId:String!){ projectWorkspaceSkillCandidates(projectWorkspaceId:$projectWorkspaceId){ dir name fileCount sourceRef } }`;
