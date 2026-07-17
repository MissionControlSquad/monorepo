import { gql } from "urql";

// Tier D: registered BYO hosts (private key never returned).
export const RUNNER_HOSTS_QUERY = gql`
  query RunnerHosts {
    runnerHosts {
      id
      name
      host
      port
      username
      createdAt
    }
  }
`;
