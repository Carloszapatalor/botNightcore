import { getTursoClient } from "../lib/turso.ts";
import { getOrCreateCurrentSeason } from "./seasonManager.ts";

interface BadgeDefinition {
  id: string;
  name: string;
  emoji: string;
  check: (data: BadgeCheckData) => boolean;
}

interface BadgeCheckData {
  streak: number;
  hardDoneToday: boolean;
  medDoneToday: boolean;
  xpWeek: number;
  daysActive7: number;
  momentum: number;
}

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "streak_7",
    name: "Semana Imparable",
    emoji: "🔥",
    check: (d) => d.streak >= 7,
  },
  {
    id: "streak_14",
    name: "Dos Semanas de Fuego",
    emoji: "🔥🔥",
    check: (d) => d.streak >= 14,
  },
  {
    id: "streak_30",
    name: "Guerrero del Mes",
    emoji: "🏅",
    check: (d) => d.streak >= 30,
  },
  {
    id: "goal_hard",
    name: "Meta Difícil Cumplida",
    emoji: "💪",
    check: (d) => d.hardDoneToday,
  },
  {
    id: "goal_medium",
    name: "Meta Media Cumplida",
    emoji: "⚔️",
    check: (d) => d.medDoneToday,
  },
  {
    id: "perfect_week",
    name: "Semana Perfecta",
    emoji: "🌟",
    check: (d) => d.daysActive7 === 7,
  },
  {
    id: "xp_50m_week",
    name: "50M XP en una semana",
    emoji: "📈",
    check: (d) => d.xpWeek >= 50_000_000,
  },
  {
    id: "momentum_80",
    name: "Momentum Élite",
    emoji: "⚡",
    check: (d) => d.momentum >= 80,
  },
];

export async function awardBadges(username: string): Promise<string[]> {
  const db = getTursoClient();
  const season = await getOrCreateCurrentSeason();
  const today = new Date().toISOString().slice(0, 10);

  // Obtener estado actual del jugador
  const metricsRow = await db.execute({
    sql: `SELECT streak_current, xp_week, days_active_7, momentum FROM member_metrics WHERE username = ?`,
    args: [username],
  });
  if (metricsRow.rows.length === 0) return [];

  const m = metricsRow.rows[0] as unknown as {
    streak_current: number;
    xp_week: number;
    days_active_7: number;
    momentum: number;
  };

  const goalRow = await db.execute({
    sql: `SELECT hard_done, med_done FROM daily_goals WHERE username = ? AND date = ?`,
    args: [username, today],
  });
  const g = goalRow.rows[0] as unknown as { hard_done: number; med_done: number } | undefined;

  const data: BadgeCheckData = {
    streak: m.streak_current,
    hardDoneToday: g?.hard_done === 1,
    medDoneToday: g?.med_done === 1,
    xpWeek: m.xp_week,
    daysActive7: m.days_active_7,
    momentum: m.momentum,
  };

  const awarded: string[] = [];

  for (const badge of BADGE_DEFINITIONS) {
    if (!badge.check(data)) continue;

    // Evitar duplicados en la misma temporada
    const exists = await db.execute({
      sql: `SELECT 1 FROM player_badges WHERE username = ? AND badge_id = ? AND season_id = ?`,
      args: [username, badge.id, season.id],
    });
    if (exists.rows.length > 0) continue;

    await db.execute({
      sql: `INSERT INTO player_badges (username, badge_id, badge_name, badge_emoji, earned_at, season_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [username, badge.id, badge.name, badge.emoji, new Date().toISOString(), season.id],
    });

    awarded.push(`${badge.emoji} ${badge.name}`);
  }

  return awarded;
}

export async function getPlayerBadges(username: string): Promise<{ current_season: unknown[]; all_time_count: number }> {
  const db = getTursoClient();
  const season = await getOrCreateCurrentSeason();

  const current = await db.execute({
    sql: `SELECT badge_id, badge_name, badge_emoji, earned_at FROM player_badges
          WHERE username = ? AND season_id = ? ORDER BY earned_at DESC`,
    args: [username, season.id],
  });

  const total = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM player_badges WHERE username = ?`,
    args: [username],
  });

  return {
    current_season: current.rows,
    all_time_count: (total.rows[0] as unknown as { cnt: number }).cnt,
  };
}

export async function awardBadgesAll(): Promise<Record<string, string[]>> {
  const db = getTursoClient();
  const players = await db.execute(`SELECT DISTINCT username FROM member_metrics`);
  const results: Record<string, string[]> = {};

  for (const row of players.rows as unknown as { username: string }[]) {
    const awarded = await awardBadges(row.username);
    if (awarded.length > 0) results[row.username] = awarded;
  }

  return results;
}
