import { gql } from "urql";

// Epic #9: terminal session mutations. openTerminalSession returns the connect token ONCE.
export const OPEN_TERMINAL_SESSION = gql`
  mutation OpenTerminalSession($command: String!, $agentId: String, $cwd: String, $label: String) {
    openTerminalSession(command: $command, agentId: $agentId, cwd: $cwd, label: $label) {
      id
      host
      port
      username
      connectToken
    }
  }
`;

export const CLOSE_TERMINAL_SESSION = gql`
  mutation CloseTerminalSession($id: String!) {
    closeTerminalSession(id: $id)
  }
`;
