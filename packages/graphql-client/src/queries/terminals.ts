import { gql } from "urql";

// Epic #9: terminal sessions read (never exposes the connect-token hash).
export const TERMINAL_SESSIONS_QUERY = gql`
  query TerminalSessions {
    terminalSessions {
      id
      label
      status
      username
      host
      port
      cwd
      lastActivityAt
      sessionExpiresAt
      closedAt
      createdAt
    }
  }
`;
