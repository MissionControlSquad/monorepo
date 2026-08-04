import { gql } from "urql";

// Epic #10: skills + teams reads.
export const SKILLS_QUERY = gql`
  query Skills {
    skills {
      id
      name
      key
      description
      icon
      color
      tagline
      author
      homepage
      currentVersion
      starCount
      installCount
      forkCount
      trustLevel
      sharingScope
      forkedFromSkillId
    }
  }
`;

export const SKILL_CATALOG_QUERY = gql`
  query SkillCatalog {
    skillCatalog {
      id
      name
      description
      icon
      tagline
      author
      starCount
      installCount
      forkCount
      trustLevel
    }
  }
`;

export const LINT_SKILL_QUERY = gql`
  query LintSkill($skillId: String!) {
    lintSkill(skillId: $skillId) {
      level
      path
      message
    }
  }
`;

export const AGENT_SKILLS_QUERY = gql`
  query AgentSkills($agentId: String!) {
    agentSkills(agentId: $agentId) {
      id
      skillId
      skill {
        id
        name
        icon
      }
    }
  }
`;

export const SKILL_FILES_QUERY = gql`
  query SkillFiles($skillId: String!) {
    skillFiles(skillId: $skillId) {
      id
      path
      content
      updatedAt
    }
  }
`;

export const TEAMS_QUERY = gql`
  query Teams {
    teams {
      id
      name
      key
      description
      icon
      tagline
      author
      tags
      kind
      trustLevel
      installCount
      members {
        id
        name
        role
      }
    }
  }
`;

export const PREVIEW_TEAM_INSTALL_QUERY = gql`
  query PreviewTeamInstall($teamId: String!, $collisionStrategy: String) {
    previewTeamInstall(teamId: $teamId, collisionStrategy: $collisionStrategy) {
      member
      action
      agentName
    }
  }
`;

// Domain 5 GAP-D: static security audit of a skill bundle.
export const AUDIT_SKILL_QUERY = gql`
  query AuditSkill($skillId: String!) {
    auditSkill(skillId: $skillId) {
      verdict
      findings {
        code
        severity
        message
        path
      }
    }
  }
`;

// Domain 5: version history of a skill bundle (Skill Studio Versions tab).
export const SKILL_VERSIONS_QUERY = gql`
  query SkillVersions($skillId: String!) {
    skillVersions(skillId: $skillId) {
      id
      revisionNumber
      label
      createdAt
    }
  }
`;
