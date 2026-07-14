import { gql } from "urql";

// Epic #12: look up a pending CLI device-auth challenge for the browser approval page.
export const CLI_AUTH_CHALLENGE_QUERY = gql`
  query CliAuthChallenge($userCode: String!) {
    cliAuthChallenge(userCode: $userCode) {
      keyName
      status
    }
  }
`;
