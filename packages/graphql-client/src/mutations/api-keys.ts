import { gql } from "urql";

// Epic #12: API key mutations. mintApiKey returns the plaintext key ONCE.
export const MINT_API_KEY = gql`
  mutation MintApiKey($name: String!, $expiresAt: DateTime) {
    mintApiKey(name: $name, expiresAt: $expiresAt) {
      id
      name
      keyPrefix
      plainKey
    }
  }
`;

export const REVOKE_API_KEY = gql`
  mutation RevokeApiKey($id: String!) {
    revokeApiKey(id: $id)
  }
`;
