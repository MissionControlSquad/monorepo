import { gql } from "urql";

// Epic #18: per-agent instruction bundle read.
export const AGENT_INSTRUCTIONS_QUERY = gql`
  query AgentInstructions($agentId: String!) {
    agentInstructions(agentId: $agentId) {
      id
      fileName
      content
      updatedAt
    }
  }
`;
