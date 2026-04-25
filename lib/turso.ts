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
  // DROP solo en desarrollo para migrar schema — quitar en producción
  // await db.execute(`DROP TABLE IF EXISTS daily_events`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS daily_events (
      event_date  TEXT NOT NULL,
      category    TEXT NOT NULL,
      event_id    TEXT NOT NULL,
      label       TEXT NOT NULL,
      selected_at TEXT NOT NULL,
      PRIMARY KEY (event_date, category)
    )
  `);
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
}
