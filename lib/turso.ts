import { createClient } from "npm:@libsql/client/web";

export function getTursoClient() {
  const url = Deno.env.get("TURSO_URL");
  const authToken = Deno.env.get("TURSO_AUTH_TOKEN");
  if (!url || !authToken) throw new Error("TURSO_URL or TURSO_AUTH_TOKEN not configured");
  return createClient({ url, authToken });
}

export async function initDb() {
  const db = getTursoClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pvm_snapshots (
      username      TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      pvm_stats     TEXT NOT NULL,
      PRIMARY KEY (username, snapshot_date)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS daily_events (
      event_date  TEXT NOT NULL,
      category    TEXT NOT NULL,
      event_id    TEXT NOT NULL,
      label       TEXT NOT NULL,
      selected_at TEXT NOT NULL,
      sent        INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (event_date, category)
    )
  `);
  try {
    await db.execute(`ALTER TABLE daily_events ADD COLUMN sent INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // columna ya existe
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rpg_players (
      username     TEXT PRIMARY KEY,
      total_exp    INTEGER NOT NULL DEFAULT 0,
      level        INTEGER NOT NULL DEFAULT 1,
      title        TEXT NOT NULL DEFAULT '🌱 Buscador',
      last_updated TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rpg_daily_exp (
      username   TEXT NOT NULL,
      date       TEXT NOT NULL,
      quest_exp  INTEGER DEFAULT 0,
      boss_exp   INTEGER DEFAULT 0,
      event_exp  INTEGER DEFAULT 0,
      total_exp  INTEGER DEFAULT 0,
      PRIMARY KEY (username, date)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS inactivity_whitelist (
      username   TEXT PRIMARY KEY,
      reason     TEXT,
      added_at   TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS xp_snapshots (
      username    TEXT NOT NULL,
      snapshot_at TEXT NOT NULL,
      total_xp    REAL NOT NULL,
      skill_xp    TEXT,
      PRIMARY KEY (username, snapshot_at)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS member_daily_xp (
      username   TEXT NOT NULL,
      date       TEXT NOT NULL,
      xp_gained  REAL NOT NULL DEFAULT 0,
      was_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (username, date)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS member_metrics (
      username          TEXT PRIMARY KEY,
      streak_current    INTEGER NOT NULL DEFAULT 0,
      streak_best       INTEGER NOT NULL DEFAULT 0,
      days_active_7     INTEGER NOT NULL DEFAULT 0,
      days_active_30    INTEGER NOT NULL DEFAULT 0,
      xp_week           REAL NOT NULL DEFAULT 0,
      xp_month          REAL NOT NULL DEFAULT 0,
      contrib_pct_day   REAL NOT NULL DEFAULT 0,
      contrib_pct_week  REAL NOT NULL DEFAULT 0,
      momentum          REAL NOT NULL DEFAULT 0,
      trend             TEXT NOT NULL DEFAULT 'stable',
      last_computed     TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS clan_rank_history (
      recorded_at   TEXT NOT NULL PRIMARY KEY,
      rank_position INTEGER,
      total_xp_24h  REAL NOT NULL DEFAULT 0,
      member_count  INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS seasons (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date   TEXT NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 1
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS daily_goals (
      username  TEXT NOT NULL,
      date      TEXT NOT NULL,
      easy_done INTEGER NOT NULL DEFAULT 0,
      med_done  INTEGER NOT NULL DEFAULT 0,
      hard_done INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (username, date)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_badges (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL,
      badge_id   TEXT NOT NULL,
      badge_name TEXT NOT NULL,
      badge_emoji TEXT NOT NULL,
      earned_at  TEXT NOT NULL,
      season_id  INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS clan_rank_goal (
      id          INTEGER PRIMARY KEY DEFAULT 1,
      target_rank INTEGER NOT NULL DEFAULT 100,
      start_rank  INTEGER,
      start_date  TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_cache (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}
