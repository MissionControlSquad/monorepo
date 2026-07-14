import { gql } from "urql";

// Epic #12: CLI device-auth approval (browser side).
export const APPROVE_CLI_AUTH = gql`
  mutation ApproveCliAuth($userCode: String!) {
    approveCliAuth(userCode: $userCode) {
      keyName
    }
  }
`;

export const DENY_CLI_AUTH = gql`
  mutation DenyCliAuth($userCode: String!) {
    denyCliAuth(userCode: $userCode)
  }
`;
