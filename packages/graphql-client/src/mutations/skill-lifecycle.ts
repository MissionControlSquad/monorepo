import { gql } from "urql";
export const RESET_SKILL_TO_ORIGIN = gql`mutation ResetSkillToOrigin($skillId:String!){ resetSkillToOrigin(skillId:$skillId){ id currentVersion } }`;
export const IMPORT_SKILL_PACKAGE = gql`mutation ImportSkillPackage($files:[SkillFileInput!]!,$sourceRef:String){ importSkillPackage(files:$files,sourceRef:$sourceRef){ id name key } }`;
