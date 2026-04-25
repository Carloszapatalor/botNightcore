import { type Context, Hono } from "hono";
import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";
import { getTursoClient } from "../lib/turso.ts";

interface MemberEntry {
  memberName: string;
}

interface RecruitmentData {
  memberlist: MemberEntry[];
}

interface PlayerProfile {
  username: string;
  pvmStats: Record<string, number>;
}

export function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchClanProfiles(): Promise<PlayerProfile[]> {
  const clanName = getClanName();
  const recruitment = await idleGet<RecruitmentData>(
    `/api/Clan/recruitment/${encodeURIComponent(clanName)}`
  );
  const profiles = await Promise.all(
    recruitment.memberlist.map((m) =>
      idleGet<PlayerProfile>(`/api/Player/profile/${encodeURIComponent(m.memberName)}`)
        .catch(() => null)
    )
  );
  return profiles.filter((p): p is PlayerProfile => p !== null);
}

export async function takeSnapshot(): Promise<{ isNew: boolean; date: string; saved: number }> {
  const today = getTodayUTC();
  const db = getTursoClient();

  // comprobar si ya existe baseline para hoy
  const existing = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM pvm_snapshots WHERE snapshot_date = ?`,
    args: [today],
  });
  const alreadyExists = (existing.rows[0] as unknown as { cnt: number }).cnt > 0;

  if (alreadyExists) {
    return { isNew: false, date: today, saved: 0 };
  }

  // primer snapshot del día → guardar como baseline
  const profiles = await fetchClanProfiles();
  for (const profile of profiles) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO pvm_snapshots (username, snapshot_date, pvm_stats) VALUES (?, ?, ?)`,
      args: [profile.username, today, JSON.stringify(profile.pvmStats)],
    });
  }

  return { isNew: true, date: today, saved: profiles.length };
}

const clanSnapshot = new Hono();

const handler = async (c: Context) => {
  try {
    const result = await takeSnapshot();
    const message = result.isNew
      ? `Baseline guardado para ${result.date} (${result.saved} miembros)`
      : `Ya existe un baseline para ${result.date}. Usa /clan/boss-report para ver los kills del día.`;
    return c.json({ ...result, message });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
};

clanSnapshot.get("/", handler);
clanSnapshot.post("/", handler);

export default clanSnapshot;
