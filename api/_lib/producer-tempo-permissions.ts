import { getProjectMembership } from './projects-db.js';

/** A session owner or an artist-created payload is not proof of producer rights. */
export async function canSetProjectTempo(
  projectId: unknown,
  userId: string,
  membership: (projectId: string, userId: string) => Promise<{role:string}|null> = getProjectMembership,
): Promise<boolean> {
  if (typeof projectId !== 'string' || !projectId.trim() || !userId) return false;
  const member = await membership(projectId.trim(), userId);
  return member?.role === 'producer';
}
