import { gql } from "urql";

// Ask a connected runner to install a missing AI CLI. Enqueues an idempotent, guarded install command
// for the runner's daemon to pull - never runs on the control-plane host. AI_TOOLS + RUNNERS, admin.
export const INSTALL_RUNTIME_TOOL_VIA_RUNNER = gql`
  mutation InstallRuntimeToolViaRunner($agentId: String!, $toolKey: String!, $os: String) {
    installRuntimeToolViaRunner(agentId: $agentId, toolKey: $toolKey, os: $os) {
      id
      status
      command
      createdAt
    }
  }
`;
