import { gql } from "urql";
export const EXTERNAL_OBJECTS_QUERY = gql`query ExternalObjects($provider: String, $linkedType: String, $linkedId: String) { externalObjects(provider: $provider, linkedType: $linkedType, linkedId: $linkedId) { id provider objectType externalId url title state linkedType linkedId fetchedAt } }`;
