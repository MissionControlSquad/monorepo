import { gql } from "urql";

export const PROJECTS_QUERY = gql`
  query Projects {
    projects {
      id
      name
      description
      status
      shutdownActive
      createdAt
      updatedAt
      members {
        id
        projectId
        profileId
        joinedAt
        profile {
          id
          displayName
          username
          avatarUrl
          agentId
          agent {
            id
            name
            identityEmoji
          }
        }
      }
    }
  }
`;

export const PROJECT_QUERY = gql`
  query Project($id: String!) {
    project(id: $id) {
      id
      name
      description
      status
      shutdownActive
      createdAt
      updatedAt
      members {
        id
        projectId
        profileId
        joinedAt
        profile {
          id
          displayName
          username
          avatarUrl
          agentId
          agent {
            id
            name
            identityEmoji
            role
            status
          }
        }
      }
    }
  }
`;

export const PROJECTS_BY_AGENT_QUERY = gql`
  query ProjectsByAgent($agentId: String!) {
    projectsByAgent(agentId: $agentId) {
      id
      name
      description
      status
      createdAt
      updatedAt
    }
  }
`;

export const PROJECT_CONTEXT_QUERY = gql`
  query ProjectContext($id: String!) {
    projectContext(id: $id)
  }
`;
