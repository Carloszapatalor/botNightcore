import { getTursoClient } from "../lib/turso.ts";

export const GOAL_TIERS = {
  hard: 5_000_000,
} as const;

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PlayerGoalStatus {
  username: string;
  date: string;
  xp_gained: number;
  done: boolean;
}

export async function checkAndUpdateGoals(username: string, date?: string): Promise<PlayerGoalStatus> {
  const db = getTursoClient();
  const day = date ?? getTodayUTC();

  const xpRow = await db.execute({
    sql: `SELECT COALESCE(xp_gained, 0) as xp FROM member_daily_xp WHERE username = ? AND date = ?`,
    args: [username, day],
  });
  const xp = (xpRow.rows[0] as unknown as { xp: number } | undefined)?.xp ?? 0;

  const hardDone = xp >= GOAL_TIERS.hard ? 1 : 0;

  await db.execute({
    sql: `INSERT OR REPLACE INTO daily_goals (username, date, easy_done, med_done, hard_done)
          VALUES (?, ?, 0, 0, ?)`,
    args: [username, day, hardDone],
  });

  return {
    username,
    date: day,
    xp_gained: xp,
    done: hardDone === 1,
  };
}

export async function checkAllGoalsToday(): Promise<PlayerGoalStatus[]> {
  const db = getTursoClient();
  const today = getTodayUTC();

  const players = await db.execute({
    sql: `SELECT DISTINCT username FROM member_daily_xp WHERE date = ?`,
    args: [today],
  });

  const results: PlayerGoalStatus[] = [];
  for (const row of players.rows as unknown as { username: string }[]) {
    results.push(await checkAndUpdateGoals(row.username, today));
  }
  return results.sort((a, b) => b.xp_gained - a.xp_gained);
}
