import { gql } from "urql";

export const CREATE_ASSET_UPLOAD_URL = gql`
  mutation CreateAssetUploadUrl($fileName: String!, $mimeType: String!) {
    createAssetUploadUrl(fileName: $fileName, mimeType: $mimeType) { key uploadUrl }
  }
`;
export const RECORD_ASSET = gql`
  mutation RecordAsset($name: String!, $kind: String!, $mimeType: String!, $storageKey: String!, $sizeBytes: Int, $ownerType: String, $ownerId: String) {
    recordAsset(name: $name, kind: $kind, mimeType: $mimeType, storageKey: $storageKey, sizeBytes: $sizeBytes, ownerType: $ownerType, ownerId: $ownerId) {
      id name kind mimeType sizeBytes createdAt
    }
  }
`;
export const DELETE_ASSET = gql`mutation DeleteAsset($id: String!) { deleteAsset(id: $id) }`;
