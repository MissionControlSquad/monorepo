import { gql } from "urql";

// Tier D: BYO host management + direct command execution.
export const CREATE_RUNNER_HOST = gql`
  mutation CreateRunnerHost(
    $name: String!
    $host: String!
    $port: Int
    $username: String
    $privateKey: String!
  ) {
    createRunnerHost(
      name: $name
      host: $host
      port: $port
      username: $username
      privateKey: $privateKey
    ) {
      id
      name
      host
      port
      username
    }
  }
`;

// Provision a Hetzner VM on the workspace's own account (BYO) and register it as a RunnerHost.
export const PROVISION_HETZNER_HOST = gql`
  mutation ProvisionHetznerHost($name: String!, $region: String, $serverType: String) {
    provisionHetznerHost(name: $name, region: $region, serverType: $serverType) {
      id
      name
      host
      port
      username
    }
  }
`;

export const DELETE_RUNNER_HOST = gql`
  mutation DeleteRunnerHost($id: String!) {
    deleteRunnerHost(id: $id)
  }
`;

export const RUN_COMMAND_ON_HOST = gql`
  mutation RunCommandOnHost($hostId: String!, $command: String!, $cwd: String, $timeoutMs: Int) {
    runCommandOnHost(hostId: $hostId, command: $command, cwd: $cwd, timeoutMs: $timeoutMs) {
      id
      status
      exitCode
      stdout
      stderr
      errorMessage
      finishedAt
      createdAt
    }
  }
`;
