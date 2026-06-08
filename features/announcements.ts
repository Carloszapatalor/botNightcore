import { getTursoClient } from "../lib/turso.ts";
import {
  sendEmbed,
  formatStreakAnnouncementEmbed,
  formatDailyXpEmbed,
  formatRankUpEmbed,
  formatRankGoalEmbed,
} from "../lib/discord.ts";

export interface RankData {
  rank: number | null;
  xp24h: number;
  memberCount?: number;
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkAnnouncements(rankData: RankData, force = false): Promise<string[]> {
  const db = getTursoClient();
  const sent: string[] = [];

  // 1. 🔥 Streak milestones: jugadores con racha múltiplo de 7
  const streakRows = await db.execute(
    `SELECT username, streak_current FROM member_metrics WHERE streak_current > 0 AND streak_current % 7 = 0`
  );
  for (const row of streakRows.rows as unknown as { username: string; streak_current: number }[]) {
    const ok = await sendEmbed("stats", formatStreakAnnouncementEmbed(row.username, row.streak_current));
    if (ok) sent.push(`🔥 streak:${row.username}(${row.streak_current}d)`);
  }

  // 2. 🏆 Rank subió vs hace 1h
  if (rankData.rank !== null) {
    const prevRow = await db.execute(
      `SELECT rank_position FROM clan_rank_history
       WHERE rank_position IS NOT NULL ORDER BY recorded_at DESC LIMIT 1 OFFSET 1`
    );
    if (prevRow.rows.length > 0) {
      const prev = (prevRow.rows[0] as unknown as { rank_position: number }).rank_position;
      if (prev > rankData.rank) {
        const ok = await sendEmbed("stats", formatRankUpEmbed(prev, rankData.rank));
        if (ok) sent.push(`🏆 rank:${prev}→${rankData.rank}`);
      }
    }
  }

  // 3. 📈 Resumen XP diaria a las 23:00 UTC (o forzado)
  const hour = new Date().getUTCHours();
  if (force || hour === 23) {
    const today = getTodayUTC();
    const todayRows = await db.execute({
      sql: `SELECT username, xp_gained FROM member_daily_xp WHERE date = ? AND was_active = 1 ORDER BY xp_gained DESC`,
      args: [today],
    });
    const members = todayRows.rows as unknown as { username: string; xp_gained: number }[];
    const totalXp = members.reduce((s, m) => s + m.xp_gained, 0);
    if (totalXp > 0) {
      const ok = await sendEmbed("stats", formatDailyXpEmbed(totalXp, members));
      if (ok) sent.push(`📈 daily-xp:${totalXp}`);
    }
  }

  // 4. 🎯 Meta de rank: si estamos cerca del top 100 (dentro del 20% de distancia)
  if (rankData.rank !== null && rankData.rank > 100) {
    const distancia = rankData.rank - 100;
    // Notificar si faltan menos de 10 posiciones para el top 100
    if (distancia <= 10) {
      // Estimación simplificada: XP necesaria ≈ distancia × XP promedio por posición
      const xpNeeded = Math.round(rankData.xp24h * distancia * 0.05);
      const ok = await sendEmbed("stats", formatRankGoalEmbed(rankData.rank, 100, xpNeeded));
      if (ok) sent.push(`🎯 goal:top100(${distancia} posiciones)`);
    }
  }

  return sent;
}
