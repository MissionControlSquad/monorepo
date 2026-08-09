import { gql } from "urql";
export const SKILL_UPDATE_STATUS_QUERY = gql`query SkillUpdateStatus($skillId:String!){ skillUpdateStatus(skillId:$skillId){ state originVersion latestVersion } }`;
// Domain 5 real-import: the app-shipped skills catalog (curated, content-addressed bundles).
export const SKILL_CATALOG_PACKAGES_QUERY = gql`query SkillCatalogPackages{ skillCatalogPackages{ id key name description category tags trustLevel contentHash packageName } }`;
