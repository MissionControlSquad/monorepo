import { gql } from "urql";

// Tier D: set an agent's runtime adapter/model/template (control-plane-dictated runtime).
export const SET_AGENT_RUNTIME = gql`
  mutation SetAgentRuntime($agentId: String!, $adapter: String, $model: String, $template: String) {
    setAgentRuntime(agentId: $agentId, adapter: $adapter, model: $model, template: $template) {
      id
      runtimeAdapter
      runtimeModel
      runtimeTemplate
    }
  }
`;
