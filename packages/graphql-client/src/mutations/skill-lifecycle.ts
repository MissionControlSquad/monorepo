import { gql } from "urql";
export const RESET_SKILL_TO_ORIGIN = gql`mutation ResetSkillToOrigin($skillId:String!){ resetSkillToOrigin(skillId:$skillId){ id currentVersion } }`;
export const IMPORT_SKILL_PACKAGE = gql`mutation ImportSkillPackage($files:[SkillFileInput!]!,$sourceRef:String){ importSkillPackage(files:$files,sourceRef:$sourceRef){ id name key } }`;
// Domain 5 real-import resolvers: install from a source spec (GitHub/URL) or the app-shipped catalog.
export const IMPORT_SKILL_FROM_SOURCE = gql`mutation ImportSkillFromSource($source:String!){ importSkillFromSource(source:$source){ id name key sourceType sourceRef packageName } }`;
export const IMPORT_SKILL_FROM_CATALOG = gql`mutation ImportSkillFromCatalog($ref:String!){ importSkillFromCatalog(ref:$ref){ id name key sourceType packageName } }`;
// §3 fork depth: reassign a fork's origin (repoint lineage + re-pin the diverged baseline).
export const REASSIGN_SKILL_FORK = gql`mutation ReassignSkillFork($skillId:String!,$newOriginId:String!){ reassignSkillFork(skillId:$skillId,newOriginId:$newOriginId){ id forkedFromSkillId } }`;
// §3 project-workspace scan: import a discovered SKILL.md bundle from a project workspace.
export const IMPORT_SKILL_FROM_PROJECT_SCAN = gql`mutation ImportSkillFromProjectScan($projectWorkspaceId:String!,$dir:String){ importSkillFromProjectScan(projectWorkspaceId:$projectWorkspaceId,dir:$dir){ id name key sourceType sourceBadge } }`;
