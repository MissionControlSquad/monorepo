import { gql } from "urql";
export const AGENT_SKILL_SNAPSHOT_QUERY = gql`query AgentSkillSnapshot($agentId:String!){ agentSkillSnapshot(agentId:$agentId) }`;
