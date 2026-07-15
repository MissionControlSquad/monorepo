import { gql } from "urql";

export const SET_AGENT_GOVERNANCE = gql`
  mutation SetAgentGovernance($requireAgentApproval: Boolean) {
    setAgentGovernance(requireAgentApproval: $requireAgentApproval) {
      requireAgentApproval
    }
  }
`;
