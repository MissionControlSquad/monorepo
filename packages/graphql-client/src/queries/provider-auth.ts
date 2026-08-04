import { gql } from "urql";
export const PROVIDER_AUTH_STATES_QUERY = gql`query ProviderAuthStates($provider: String, $needsAttention: Boolean) { providerAuthStates(provider: $provider, needsAttention: $needsAttention) { id provider accountRef state scopes expiresAt lastCheckedAt } }`;
