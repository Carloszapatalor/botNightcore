import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";
import { getTursoClient } from "../lib/turso.ts";

interface SkillData {
  experience: number;
  level: number;
}

interface PlayerContribution {
  username: string;
  totalExperience: number;
  skills: Record<string, SkillData>;
}

interface ClanExperienceSummary {
  clanName: string;
  periodHours: number;
  totalExperience: number;
  playerContributions: PlayerContribution[];
}


export async function syncMemberXp(): Promise<{ synced: number; date: string }> {
  const clanName = getClanName();
  const db = getTursoClient();
  const now = new Date();
  const snapshotAt = now.toISOString();
  const date = now.toISOString().slice(0, 10);

  // hours=24: totalExperience es XP ganada en las últimas 24h (relativo, no absoluto)
  // Se reemplaza en cada sync — al final del día refleja el total del día
  const data = await idleGet<ClanExperienceSummary>(
    `/api/Clan/${encodeURIComponent(clanName)}/experience?hours=24`
  );

  let synced = 0;

  for (const player of data.playerContributions) {
    const { username, totalExperience, skills } = player;

    // Guardar snapshot (historial de lecturas)
    const skillJson = JSON.stringify(
      Object.fromEntries(
        Object.entries(skills).map(([k, v]) => [k, v.experience])
      )
    );
    await db.execute({
      sql: `INSERT OR REPLACE INTO xp_snapshots (username, snapshot_at, total_xp, skill_xp) VALUES (?, ?, ?, ?)`,
      args: [username, snapshotAt, totalExperience, skillJson],
    });

    // Reemplazar el valor del día con la lectura más reciente de las últimas 24h
    const wasActive = totalExperience > 0 ? 1 : 0;
    await db.execute({
      sql: `INSERT OR REPLACE INTO member_daily_xp (username, date, xp_gained, was_active)
            VALUES (?, ?, ?, ?)`,
      args: [username, date, totalExperience, wasActive],
    });

    synced++;
  }

  return { synced, date };
}

interface LeaderboardProfile {
  totalLevelResult?: {
    totalLevel?: number;
    score?: number;
    rank?: number;
  };
}

async function detectClanRankFromApi(clanName: string): Promise<number | null> {
  try {
    const data = await idleGet<LeaderboardProfile>(
      `/api/Leaderboard/profile/clans:default/${encodeURIComponent(clanName)}`
    );
    const rank = data.totalLevelResult?.rank ?? null;
    if (typeof rank === "number" && rank > 0) return rank;
  } catch {
    // ignorar
  }
  return null;
}

export async function syncClanRank(): Promise<{ rank: number | null; xp24h: number }> {
  const clanName = getClanName();
  const db = getTursoClient();
  const recordedAt = new Date().toISOString();

  // XP del clan — siempre desde el endpoint propio (no depende del top 100)
  const data = await idleGet<ClanExperienceSummary>(
    `/api/Clan/${encodeURIComponent(clanName)}/experience?hours=24`
  );
  const xp24h = data.totalExperience;

  // Rank — intentar auto-detectar desde la API primero
  let rank = await detectClanRankFromApi(clanName);

  // Si la API lo devuelve, guardarlo como rank de inicio si aún no hay uno
  if (rank !== null) {
    const goalRow = await db.execute(`SELECT start_rank FROM clan_rank_goal WHERE id = 1`);
    const hasGoal = goalRow.rows.length > 0 &&
      (goalRow.rows[0] as unknown as { start_rank: number | null }).start_rank !== null;

    if (!hasGoal) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO clan_rank_goal (id, target_rank, start_rank, start_date) VALUES (1, 100, ?, ?)`,
        args: [rank, new Date().toISOString().slice(0, 10)],
      });
    }
  } else {
    // Fallback: leer rank guardado manualmente
    const goalRow = await db.execute(`SELECT start_rank FROM clan_rank_goal WHERE id = 1`);
    if (goalRow.rows.length > 0) {
      rank = (goalRow.rows[0] as unknown as { start_rank: number | null }).start_rank;
    }
  }

  await db.execute({
    sql: `INSERT OR REPLACE INTO clan_rank_history (recorded_at, rank_position, total_xp_24h, member_count)
          VALUES (?, ?, ?, ?)`,
    args: [recordedAt, rank, xp24h, data.playerContributions.length],
  });

  return { rank, xp24h };
}
