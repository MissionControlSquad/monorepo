import { gql } from "urql";

export const FOLDERS_QUERY = gql`
  query Folders { folders { id name parentFolderId order createdAt } }
`;
export const FOLDER_ITEMS_QUERY = gql`
  query FolderItems($folderId: String!) {
    folderItems(folderId: $folderId) { id folderId itemType itemId addedAt }
  }
`;
