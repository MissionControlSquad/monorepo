import { gql } from "urql";
export const UPSERT_CLOUD_UPSTREAM = gql`mutation UpsertCloudUpstream($projectId: String!, $name: String!, $remoteUrl: String!, $remoteRef: String) { upsertCloudUpstream(projectId: $projectId, name: $name, remoteUrl: $remoteUrl, remoteRef: $remoteRef) { id name syncState } }`;
export const DELETE_CLOUD_UPSTREAM = gql`mutation DeleteCloudUpstream($id: String!) { deleteCloudUpstream(id: $id) }`;
