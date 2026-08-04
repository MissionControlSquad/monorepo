import { gql } from "urql";
export const ADD_SKILL_COMMENT = gql`mutation AddSkillComment($skillId: String!, $body: String!, $parentCommentId: String) { addSkillComment(skillId: $skillId, body: $body, parentCommentId: $parentCommentId) { id body createdAt } }`;
export const DELETE_SKILL_COMMENT = gql`mutation DeleteSkillComment($id: String!) { deleteSkillComment(id: $id) }`;
