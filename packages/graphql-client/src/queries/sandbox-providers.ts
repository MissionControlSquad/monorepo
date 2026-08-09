import { gql } from "urql";

// Tier D: list sandbox providers for this workspace — which secrets to add + whether they're set.
export const SANDBOX_PROVIDERS_QUERY = gql`
  query SandboxProviders {
    sandboxProviders {
      key
      displayName
      requiresApiKey
      credentialKeys
      isolating
      configured
      available
    }
  }
`;
