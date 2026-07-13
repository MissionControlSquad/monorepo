import { gql } from "urql";

// Epic #12: API keys read (never exposes the secret hash or plaintext).
export const API_KEYS_QUERY = gql`
  query ApiKeys {
    apiKeys {
      id
      name
      keyPrefix
      lastUsedAt
      revokedAt
      expiresAt
      createdAt
    }
  }
`;
