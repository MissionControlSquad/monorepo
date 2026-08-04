import { gql } from "urql";

export const ASSETS_QUERY = gql`
  query Assets($kind: String, $ownerType: String, $ownerId: String) {
    assets(kind: $kind, ownerType: $ownerType, ownerId: $ownerId) {
      id name kind mimeType sizeBytes ownerType ownerId createdAt
    }
  }
`;
export const ASSET_DOWNLOAD_URL_QUERY = gql`query AssetDownloadUrl($id: String!) { assetDownloadUrl(id: $id) }`;
