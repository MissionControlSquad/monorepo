import { gql } from "urql";
export const SYNC_AGENT_SKILLS = gql`mutation SyncAgentSkills($agentId:String!,$desiredSkills:[DesiredSkillInput!]!){ syncAgentSkills(agentId:$agentId,desiredSkills:$desiredSkills){ agentId adapterType mode entries { skillId state } warnings } }`;
