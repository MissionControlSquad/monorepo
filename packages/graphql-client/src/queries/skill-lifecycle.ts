import { gql } from "urql";
export const SKILL_UPDATE_STATUS_QUERY = gql`query SkillUpdateStatus($skillId:String!){ skillUpdateStatus(skillId:$skillId){ state originVersion latestVersion } }`;
