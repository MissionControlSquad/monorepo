import { gql } from "urql";

export const INGEST_EVENT = gql`
  mutation IngestEvent($event: String!, $apiKey: String!) {
    ingestEvent(event: $event, apiKey: $apiKey)
  }
`;
