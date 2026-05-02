const BASE = "https://query.idleclans.com";

export async function idleGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export interface SimpleProfile {
  hoursOffline: number;
  taskTypeOnLogout: number | null;
  taskNameOnLogout: string | null;
}

export async function fetchMemberProfiles(memberNames: string[]): Promise<{ name: string; hoursOffline: number; lastTask: string | null }[]> {
  const profiles = await Promise.all(
    memberNames.map((name) =>
      idleGet<SimpleProfile>(`/api/Player/profile/simple/${encodeURIComponent(name)}`)
        .then((p) => ({ name, hoursOffline: p.hoursOffline, lastTask: p.taskNameOnLogout ?? null }))
        .catch(() => ({ name, hoursOffline: -1, lastTask: null }))
    )
  );
  return profiles;
}
