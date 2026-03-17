import { gql } from "urql";

export const SET_SYSTEM_SHUTDOWN = gql`
  mutation SetSystemShutdown($active: Boolean!) {
    setSystemShutdown(active: $active) {
      shutdownActive
    }
  }
`;

export const SET_PROJECT_SHUTDOWN = gql`
  mutation SetProjectShutdown($projectId: String!, $active: Boolean!) {
    setProjectShutdown(projectId: $projectId, active: $active) {
      projectId
      shutdownActive
    }
  }
`;

export const SYSTEM_SETTINGS_QUERY = gql`
  query SystemSettings {
    systemSettings {
      shutdownActive
    }
  }
`;

export const CHANGE_PASSWORD = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword) {
      success
    }
  }
`;

export const GENERATE_RESET_LINK = gql`
  mutation GeneratePasswordResetLink($adminUserId: String!) {
    generatePasswordResetLink(adminUserId: $adminUserId) {
      resetUrl
      expiresAt
      targetUsername
    }
  }
`;

export const ADMIN_USERS_QUERY = gql`
  query AdminUsers {
    adminUsers {
      id
      username
      createdAt
    }
  }
`;
