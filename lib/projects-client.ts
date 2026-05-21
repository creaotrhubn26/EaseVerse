import { authedFetch } from "./authed-fetch";

export type ProjectRole = "producer" | "vocalist" | "band_member" | "mix_engineer" | "observer";

export type Project = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
};

export type ProjectListItem = Project & { role: ProjectRole; memberCount: number };

export type ProjectMember = {
  projectId: string;
  userId: string;
  email: string | null;
  role: ProjectRole;
  invitedByUserId: string | null;
  joinedAt: string;
};

export async function listProjects(token: string | null): Promise<ProjectListItem[]> {
  const res = await authedFetch("/api/projects", token, { method: "GET" });
  if (!res.ok) throw new Error(`List projects failed: ${res.status}`);
  const json = (await res.json()) as { projects: ProjectListItem[] };
  return json.projects;
}

export async function createProject(token: string | null, name: string): Promise<Project> {
  const res = await authedFetch("/api/projects", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Create project failed: ${res.status}`);
  const json = (await res.json()) as { project: Project };
  return json.project;
}

export async function getProject(
  token: string | null,
  projectId: string,
): Promise<{ project: Project; members: ProjectMember[]; viewerRole: ProjectRole }> {
  const res = await authedFetch(
    `/api/projects/detail?id=${encodeURIComponent(projectId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`Get project failed: ${res.status}`);
  return (await res.json()) as { project: Project; members: ProjectMember[]; viewerRole: ProjectRole };
}

export type AddMemberResult =
  | { kind: "member"; member: ProjectMember }
  | { kind: "pending"; email: string; role: ProjectRole };

export async function addMember(
  token: string | null,
  projectId: string,
  email: string,
  role: ProjectRole,
): Promise<AddMemberResult> {
  const res = await authedFetch(
    `/api/projects/detail?id=${encodeURIComponent(projectId)}`,
    token,
    { method: "POST", body: JSON.stringify({ email, role }) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Add member failed: ${res.status}`);
  }
  const json = await res.json();
  if (res.status === 202 && json.pending) {
    return { kind: "pending", email: json.pending.email, role: json.pending.role };
  }
  return { kind: "member", member: (json as { member: ProjectMember }).member };
}

export async function removeMember(
  token: string | null,
  projectId: string,
  userId: string,
): Promise<void> {
  const res = await authedFetch(
    `/api/projects/detail?id=${encodeURIComponent(projectId)}&userId=${encodeURIComponent(userId)}`,
    token,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Remove member failed: ${res.status}`);
}
