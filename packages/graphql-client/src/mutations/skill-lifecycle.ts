import { gql } from "urql";
export const RESET_SKILL_TO_ORIGIN = gql`mutation ResetSkillToOrigin($skillId:String!){ resetSkillToOrigin(skillId:$skillId){ id currentVersion } }`;
export const IMPORT_SKILL_PACKAGE = gql`mutation ImportSkillPackage($files:[SkillFileInput!]!,$sourceRef:String){ importSkillPackage(files:$files,sourceRef:$sourceRef){ id name key } }`;
// Domain 5 real-import resolvers: install from a source spec (GitHub/URL) or the app-shipped catalog.
export const IMPORT_SKILL_FROM_SOURCE = gql`mutation ImportSkillFromSource($source:String!){ importSkillFromSource(source:$source){ id name key sourceType sourceRef packageName } }`;
export const IMPORT_SKILL_FROM_CATALOG = gql`mutation ImportSkillFromCatalog($ref:String!){ importSkillFromCatalog(ref:$ref){ id name key sourceType packageName } }`;
