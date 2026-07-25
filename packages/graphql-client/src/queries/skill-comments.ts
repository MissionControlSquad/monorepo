import { gql } from "urql";
export const SKILL_COMMENTS_QUERY = gql`query SkillComments($skillId: String!) { skillComments(skillId: $skillId) { id skillId parentCommentId authorAgentId authorProfileId body deletedAt createdAt } }`;
