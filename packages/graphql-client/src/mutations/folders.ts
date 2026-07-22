import { gql } from "urql";

// Folders (parity #64) — FOLDERS-gated, admin-only mutations.
export const CREATE_FOLDER = gql`
  mutation CreateFolder($name: String!, $parentFolderId: String) {
    createFolder(name: $name, parentFolderId: $parentFolderId) { id name parentFolderId order }
  }
`;
export const RENAME_FOLDER = gql`
  mutation RenameFolder($id: String!, $name: String!) {
    renameFolder(id: $id, name: $name) { id name }
  }
`;
export const MOVE_FOLDER = gql`
  mutation MoveFolder($id: String!, $parentFolderId: String) {
    moveFolder(id: $id, parentFolderId: $parentFolderId) { id parentFolderId }
  }
`;
export const DELETE_FOLDER = gql`
  mutation DeleteFolder($id: String!) { deleteFolder(id: $id) }
`;
export const ADD_FOLDER_ITEM = gql`
  mutation AddFolderItem($folderId: String!, $itemType: String!, $itemId: String!) {
    addFolderItem(folderId: $folderId, itemType: $itemType, itemId: $itemId) { id folderId itemType itemId }
  }
`;
export const REMOVE_FOLDER_ITEM = gql`
  mutation RemoveFolderItem($folderId: String!, $itemType: String!, $itemId: String!) {
    removeFolderItem(folderId: $folderId, itemType: $itemType, itemId: $itemId)
  }
`;
