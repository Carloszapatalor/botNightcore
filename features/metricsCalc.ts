import { getTursoClient } from "../lib/turso.ts";

function getWeekStartUTC(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Dom, 1=Lun...
  const diff = day === 0 ? 6 : day - 1; // días desde el lunes
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10);
}

function getMonthStartUTC(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function getDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayUTC(): string {
  return getDateOffset(1);
}

async function calcStreak(db: ReturnType<typeof getTursoClient>, username: string): Promise<{ current: number; includesToday: boolean }> {
  const rows = await db.execute({
    sql: `SELECT date FROM member_daily_xp WHERE username = ? AND was_active = 1 ORDER BY date DESC`,
    args: [username],
  });

  const dates = (rows.rows as unknown as { date: string }[]).map((r) => r.date);
  const today = getTodayUTC();
  const yesterday = getYesterdayUTC();

  let streak = 0;
  // Si jugó hoy, el streak empieza desde hoy; si no, desde ayer
  const startDate = dates[0] === today ? today : yesterday;
  let expected = startDate;

  for (const date of dates) {
    if (date === expected) {
      streak++;
      const d = new Date(expected + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      expected = d.toISOString().slice(0, 10);
    } else if (date < expected) {
      break;
    }
  }

  return { current: streak, includesToday: dates[0] === today };
}

export async function computeAllMetrics(): Promise<{ processed: number }> {
  const db = getTursoClient();
  const today = getTodayUTC();
  const weekStart = getWeekStartUTC();
  const monthStart = getMonthStartUTC();
  const day7ago = getDateOffset(7);
  const day14ago = getDateOffset(14);
  const day30ago = getDateOffset(30);

  // Obtener todos los jugadores con actividad histórica
  const playersRes = await db.execute(
    `SELECT DISTINCT username FROM member_daily_xp`
  );
  const players = (playersRes.rows as unknown as { username: string }[]).map((r) => r.username);

  // Total XP del clan hoy y esta semana (para contrib %)
  const clanTodayRes = await db.execute({
    sql: `SELECT COALESCE(SUM(xp_gained), 0) as total FROM member_daily_xp WHERE date = ?`,
    args: [today],
  });
  const clanTodayXp = (clanTodayRes.rows[0] as unknown as { total: number }).total;

  const clanWeekRes = await db.execute({
    sql: `SELECT COALESCE(SUM(xp_gained), 0) as total FROM member_daily_xp WHERE date >= ?`,
    args: [weekStart],
  });
  const clanWeekXp = (clanWeekRes.rows[0] as unknown as { total: number }).total;

  let processed = 0;

  for (const username of players) {
    // Streak
    const { current: streakCurrent } = await calcStreak(db, username);

    // streak_best: nunca decrece
    const prevMetrics = await db.execute({
      sql: `SELECT streak_best FROM member_metrics WHERE username = ?`,
      args: [username],
    });
    const prevBest = prevMetrics.rows.length > 0
      ? (prevMetrics.rows[0] as unknown as { streak_best: number }).streak_best
      : 0;
    const streakBest = Math.max(streakCurrent, prevBest);

    // Días activos
    const active7Res = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM member_daily_xp WHERE username = ? AND was_active = 1 AND date >= ?`,
      args: [username, day7ago],
    });
    const daysActive7 = (active7Res.rows[0] as unknown as { cnt: number }).cnt;

    const active30Res = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM member_daily_xp WHERE username = ? AND was_active = 1 AND date >= ?`,
      args: [username, day30ago],
    });
    const daysActive30 = (active30Res.rows[0] as unknown as { cnt: number }).cnt;

    // XP semana y mes
    const xpWeekRes = await db.execute({
      sql: `SELECT COALESCE(SUM(xp_gained), 0) as total FROM member_daily_xp WHERE username = ? AND date >= ?`,
      args: [username, weekStart],
    });
    const xpWeek = (xpWeekRes.rows[0] as unknown as { total: number }).total;

    const xpMonthRes = await db.execute({
      sql: `SELECT COALESCE(SUM(xp_gained), 0) as total FROM member_daily_xp WHERE username = ? AND date >= ?`,
      args: [username, monthStart],
    });
    const xpMonth = (xpMonthRes.rows[0] as unknown as { total: number }).total;

    // Contribución %
    const xpTodayRes = await db.execute({
      sql: `SELECT COALESCE(xp_gained, 0) as xp FROM member_daily_xp WHERE username = ? AND date = ?`,
      args: [username, today],
    });
    const xpToday = (xpTodayRes.rows[0] as unknown as { xp: number | null })?.xp ?? 0;

    const contribDay = clanTodayXp > 0 ? (xpToday / clanTodayXp) * 100 : 0;
    const contribWeek = clanWeekXp > 0 ? (xpWeek / clanWeekXp) * 100 : 0;

    // Tendencia: avg últimos 7 días vs avg 7 días anteriores
    const avgRecent = await db.execute({
      sql: `SELECT COALESCE(AVG(xp_gained), 0) as avg FROM member_daily_xp WHERE username = ? AND date >= ?`,
      args: [username, day7ago],
    });
    const avgPrev = await db.execute({
      sql: `SELECT COALESCE(AVG(xp_gained), 0) as avg FROM member_daily_xp WHERE username = ? AND date >= ? AND date < ?`,
      args: [username, day14ago, day7ago],
    });
    const recentAvg = (avgRecent.rows[0] as unknown as { avg: number }).avg;
    const prevAvg = (avgPrev.rows[0] as unknown as { avg: number }).avg;

    let trend: string;
    if (prevAvg === 0) {
      trend = recentAvg > 0 ? "up" : "stable";
    } else if (recentAvg > prevAvg * 1.10) {
      trend = "up";
    } else if (recentAvg < prevAvg * 0.90) {
      trend = "down";
    } else {
      trend = "stable";
    }

    // Momentum: métrica compuesta 0..120
    const streakScore = Math.min(streakCurrent / 30, 1.0);
    const activityScore = daysActive7 / 7;
    const contribScore = Math.min(contribWeek / 20, 1.0);
    const trendBonus = trend === "up" ? 0.2 : trend === "down" ? -0.1 : 0;
    const momentum = Math.round(
      (streakScore * 0.4 + activityScore * 0.35 + contribScore * 0.25 + trendBonus) * 100 * 10
    ) / 10;

    await db.execute({
      sql: `INSERT OR REPLACE INTO member_metrics
              (username, streak_current, streak_best, days_active_7, days_active_30,
               xp_week, xp_month, contrib_pct_day, contrib_pct_week, momentum, trend, last_computed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        username, streakCurrent, streakBest, daysActive7, daysActive30,
        xpWeek, xpMonth,
        Math.round(contribDay * 100) / 100,
        Math.round(contribWeek * 100) / 100,
        momentum, trend,
        new Date().toISOString(),
      ],
    });

    processed++;
  }

  return { processed };
}

export async function pruneOldHistory(days: number): Promise<void> {
  const db = getTursoClient();
  await db.execute({
    sql: `DELETE FROM xp_snapshots WHERE snapshot_at < DATETIME('now', ?)`,
    args: [`-${days} days`],
  });
  await db.execute({
    sql: `DELETE FROM member_daily_xp WHERE date < DATE('now', ?)`,
    args: [`-${days} days`],
  });
  await db.execute({
    sql: `DELETE FROM clan_rank_history WHERE recorded_at < DATETIME('now', ?)`,
    args: [`-${days} days`],
  });
}
