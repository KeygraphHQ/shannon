/**
 * Organization roles in order of permission level (highest to lowest).
 * Shared between client and server components.
 */
export const ORG_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;

export type OrgRole = (typeof ORG_ROLES)[keyof typeof ORG_ROLES];

/**
 * Role hierarchy for permission checking.
 * Higher index = more permissions.
 */
export const ROLE_HIERARCHY: OrgRole[] = ["viewer", "member", "admin", "owner"];

/**
 * Check if a role has at least the minimum required permission level.
 */
export function hasMinimumRole(userRole: string, minimumRole: OrgRole): boolean {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole as OrgRole);
  const minimumRoleIndex = ROLE_HIERARCHY.indexOf(minimumRole);

  if (userRoleIndex === -1 || minimumRoleIndex === -1) {
    return false;
  }

  return userRoleIndex >= minimumRoleIndex;
}

/**
 * Permission definitions for organization actions.
 */
export const ORG_PERMISSIONS = {
  // Organization settings
  VIEW_ORG_SETTINGS: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
  EDIT_ORG_SETTINGS: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
  DELETE_ORG: [ORG_ROLES.OWNER],

  // Team management
  VIEW_TEAM: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER, ORG_ROLES.VIEWER],
  INVITE_MEMBER: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
  REMOVE_MEMBER: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
  CHANGE_ROLE: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],

  // Scans
  VIEW_SCANS: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER, ORG_ROLES.VIEWER],
  CREATE_SCAN: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER],
  DELETE_SCAN: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],

  // Audit logs
  VIEW_AUDIT_LOG: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
} as const;
