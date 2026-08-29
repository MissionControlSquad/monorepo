import { gql } from "urql";

// Parity §3 #7: user-scoped secret definitions + coverage (metadata only — never a value).
export const USER_SECRET_DEFINITIONS_QUERY = gql`
  query UserSecretDefinitions {
    userSecretDefinitions {
      id
      key
      displayName
      description
      required
      createdAt
    }
  }
`;

export const USER_SECRET_COVERAGE_QUERY = gql`
  query UserSecretCoverage($profileId: String) {
    userSecretCoverage(profileId: $profileId) {
      profileId
      total
      provided
      missing
      items {
        definitionId
        key
        displayName
        description
        required
        status
        updatedAt
      }
    }
  }
`;
