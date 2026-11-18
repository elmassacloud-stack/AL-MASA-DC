import { Project, UserProfile } from '../types';
import { isSuperAdminEmail } from '../config';

/**
 * Checks if a user has unrestricted access to all projects.
 */
export function hasAllProjectsAccess(user?: UserProfile | null): boolean {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    isSuperAdminEmail(user.email) ||
    user.allProjects === true
  );
}

/**
 * Returns ONLY the projects the user is permitted to view and submit against.
 */
export function getAccessibleProjects(user: UserProfile | null | undefined, projects: Project[]): Project[] {
  if (!user) return [];
  if (hasAllProjectsAccess(user)) {
    return projects;
  }
  const assigned = Array.isArray(user.assignedProjects) ? user.assignedProjects : [];
  return projects.filter((p) => assigned.includes(p.id));
}

/**
 * Checks whether a user is allowed to access a specific project ID.
 */
export function canAccessProject(user: UserProfile | null | undefined, projectId?: string | null): boolean {
  if (!user || !projectId) return false;
  if (hasAllProjectsAccess(user)) return true;
  const assigned = Array.isArray(user.assignedProjects) ? user.assignedProjects : [];
  return assigned.includes(projectId);
}

/**
 * Checks whether a user is allowed to access the "الأعمال المنفذة بالموقع" tab.
 */
export function canAccessExecutedWorksTab(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin' || isSuperAdminEmail(user.email)) return true;
  return user.canAccessExecutedWorks !== false;
}

/**
 * Checks whether a user is allowed to access the "تسليمات الموقع" tab.
 * Enabled for all active authenticated user emails.
 */
export function canAccessSiteDeliverablesTab(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  return user.status !== 'disabled';
}
