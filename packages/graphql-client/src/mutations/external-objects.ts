import { gql } from "urql";
export const UPSERT_EXTERNAL_OBJECT = gql`mutation UpsertExternalObject($reference: String!, $linkedType: String, $linkedId: String) { upsertExternalObject(reference: $reference, linkedType: $linkedType, linkedId: $linkedId) { id provider objectType externalId url title state } }`;
export const REFRESH_EXTERNAL_OBJECT = gql`mutation RefreshExternalObject($id: String!) { refreshExternalObject(id: $id) { id title state fetchedAt } }`;
export const DELETE_EXTERNAL_OBJECT = gql`mutation DeleteExternalObject($id: String!) { deleteExternalObject(id: $id) }`;
