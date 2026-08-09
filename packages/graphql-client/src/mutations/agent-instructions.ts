import { gql } from "urql";

// Epic #18: agent instruction mutations.
export const UPSERT_AGENT_INSTRUCTION = gql`
  mutation UpsertAgentInstruction($agentId: String!, $fileName: String!, $content: String!) {
    upsertAgentInstruction(agentId: $agentId, fileName: $fileName, content: $content) {
      id
      fileName
    }
  }
`;

export const DELETE_AGENT_INSTRUCTION = gql`
  mutation DeleteAgentInstruction($agentId: String!, $fileName: String!) {
    deleteAgentInstruction(agentId: $agentId, fileName: $fileName)
  }
`;

export const SEED_AGENT_INSTRUCTIONS = gql`
  mutation SeedAgentInstructions($agentId: String!) {
    seedAgentInstructions(agentId: $agentId) {
      id
      fileName
    }
  }
`;
