import { gql } from "urql";
export const SYNC_AGENT_SKILLS = gql`mutation SyncAgentSkills($agentId:String!,$mode:SkillMergeMode!,$desiredSkills:[DesiredSkillInput!]!){ syncAgentSkills(agentId:$agentId,mode:$mode,desiredSkills:$desiredSkills){ agentId adapterType mode entries { skillId state } warnings } }`;
